import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { AcpManager } from "./manager.js";
import { Store } from "./store.js";
import { WsHub } from "./ws.js";
import { SessionLog } from "./sessionlog.js";
import { handleApi, type ApiContext } from "./routes.js";
import type { WsServerEvent } from "./types.js";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const PORT = Number(argValue("--port") ?? process.env.PORT ?? 7781);
const HOST = argValue("--host") ?? "127.0.0.1";
const wantOpen = args.includes("--open") || (!args.includes("--no-open") && !!process.stdout.isTTY && !process.env.SSH_CONNECTION);
const wantVersion = args.includes("--version") || args.includes("-v");
const wantHelp = args.includes("--help") || args.includes("-h");

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"),
) as { version: string };

if (wantVersion) {
  console.log(`devin-remote ${pkg.version}`);
  process.exit(0);
}
if (wantHelp) {
  console.log(`devin-remote — a browser console for the Devin CLI (ACP)

Usage: devin-remote [options]

Options:
  --port <port>   Port to bind (default 7781, env PORT)
  --host <host>   Host to bind (default 127.0.0.1)
  --open          Open the browser once listening
  --no-open       Do not open the browser
  --version       Print version
  --help          Show this help

Requires: devin CLI on PATH and a completed 'devin auth login'.
Data:   ~/.devin-remote (override with DEVIN_REMOTE_HOME)
Env:    DEVIN_REMOTE_ALLOWED_HOSTS — comma-separated extra hostnames allowed
        by the CSRF/DNS-rebinding guard (reverse proxies, tailscale serve, …)`);
  process.exit(0);
}

// ---- CSRF / DNS-rebinding guard --------------------------------------------
// Without this, any web page could fire fetch()/WebSocket at 127.0.0.1:7781
// and drive Devin (send prompts, blind-approve permission requests).
// Host check (rebinding): allowlisted names or IP literals only. Origin check
// (CSRF): must match the request Host — including the port when both sides
// state one, so an app on another port of the same machine can't drive this
// one — or be explicitly allowlisted via DEVIN_REMOTE_ALLOWED_HOSTS (for
// Host-rewriting reverse proxies and tunnels).

/** Lowercased {hostname, explicit port} of a bare host, host:port, or origin — null if unparseable. */
function hostParts(value: string | undefined): { host: string; port: string } | null {
  if (!value) return null;
  let v = value.trim().toLowerCase();
  if (!v) return null;
  const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(v);
  if (!hadScheme) v = `http://${v}`;
  try {
    const u = new URL(v);
    // For real origins resolve the scheme's default port; a bare Host header
    // keeps "" (its scheme is unknowable behind a TLS-terminating proxy).
    const port = u.port || (hadScheme ? (u.protocol === "https:" ? "443" : "80") : "");
    return { host: u.hostname.replace(/^\[|\]$/g, ""), port };
  } catch {
    return null;
  }
}

const allowedHostnames = new Set(["localhost", "127.0.0.1", "::1", os.hostname().toLowerCase()]);
{
  const bound = hostParts(HOST);
  if (bound && bound.host !== "0.0.0.0" && bound.host !== "::") allowedHostnames.add(bound.host);
}
/** User-declared proxy/tunnel names: valid as Host and as a non-matching Origin. */
const extraAllowedHostnames = new Set<string>();
for (const extra of (process.env.DEVIN_REMOTE_ALLOWED_HOSTS ?? "").split(",")) {
  const p = hostParts(extra);
  if (p) {
    allowedHostnames.add(p.host);
    extraAllowedHostnames.add(p.host);
  }
}

function isAllowedRequest(req: http.IncomingMessage): boolean {
  const host = hostParts(req.headers.host);
  if (!host) return false;
  // IP-literal Hosts can't be a DNS-rebinding vector (the attack needs the
  // attacker's DNS name in Host); other names must be explicitly allowed.
  if (!allowedHostnames.has(host.host) && net.isIP(host.host) === 0) return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true; // same-origin fetch / non-browser client
  const o = hostParts(String(origin));
  if (!o) return false; // includes "Origin: null"
  if (extraAllowedHostnames.has(o.host)) return true;
  if (o.host !== host.host) return false;
  // Portless Host (behind a proxy) accepts the default-port origin forms;
  // an explicit Host port must match the origin's exactly.
  if (host.port === "") return o.port === "80" || o.port === "443";
  return o.port === host.port;
}

// ---- devin CLI checks ------------------------------------------------------
interface DevinCheck {
  installed: boolean;
  version: string | null;
  authed: boolean;
  detail: string;
}
let cachedCheck: { at: number; result: DevinCheck } | null = null;
async function devinCheck(): Promise<DevinCheck> {
  if (cachedCheck && Date.now() - cachedCheck.at < 30_000) return cachedCheck.result;
  const result: DevinCheck = { installed: false, version: null, authed: false, detail: "" };
  try {
    const v = await execFileP("devin", ["version"], { timeout: 10_000 });
    result.installed = true;
    result.version = v.stdout.trim().split("\n")[0] ?? null;
    const s = await execFileP("devin", ["auth", "status"], { timeout: 10_000 });
    result.authed = /logged in/i.test(s.stdout);
    result.detail = s.stdout.trim();
  } catch (err) {
    result.detail = err instanceof Error ? err.message : String(err);
  }
  cachedCheck = { at: Date.now(), result };
  return result;
}

// ---- wiring ----------------------------------------------------------------
const store = new Store();
const sessionLog = new SessionLog();
const sessionCwd = new Map<string, string>();
const permissionOwner = new Map<string, import("./acp.js").DevinAcp>();
const primaryCwd = process.cwd();

const httpServer = http.createServer();

const hub = new WsHub(
  httpServer,
  () => ({
    type: "config",
    app: { name: "devin-remote", version: pkg.version },
    settings: store.settings,
  }),
  { verifyOrigin: isAllowedRequest },
);

const manager = new AcpManager({
  onSessionUpdate: (sessionId, update) => {
    sessionLog.append(sessionId, update as Record<string, unknown>);
    hub.broadcast({ type: "session_update", sessionId, update });
  },
  onAgentLog: (sessionId, channel, message, level) => {
    hub.broadcast({ type: "agent_log", sessionId, channel, message, level });
  },
  onPermissionRequest: (requestId, sessionId, toolCall, options) => {
    hub.broadcast({ type: "permission_request", requestId, sessionId, toolCall, options });
  },
  onPermissionOwner: (requestId, owner) => {
    permissionOwner.set(requestId, owner);
  },
  onPermissionResolved: (requestId) => {
    // Timed out or the process died — tell clients so stale cards disappear.
    permissionOwner.delete(requestId);
    hub.broadcast({ type: "permission_resolved", requestId });
  },
  onTerminalOutput: (terminalId, sessionId, data) => {
    hub.broadcast({ type: "terminal_output", terminalId, sessionId, data });
  },
  onTerminalExit: (terminalId, sessionId, exitCode, signal) => {
    hub.broadcast({ type: "terminal_exit", terminalId, sessionId, exitCode, signal });
  },
  onExit: (cwd, code) => {
    hub.broadcast({ type: "process_status", cwd, status: "exited", code });
  },
});

const ctx: ApiContext = {
  store,
  manager,
  hub,
  sessionLog,
  appVersion: pkg.version,
  primaryCwd,
  devinCheck,
  sessionCwd,
  permissionOwner,
};

// ---- static files ----------------------------------------------------------
const WEB_DIRS = [path.join(__dirname, "..", "web"), path.join(__dirname, "..", "..", "dist", "web")];
const webDir = WEB_DIRS.find((d) => fs.existsSync(path.join(d, "index.html")));
const STATIC_MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (!webDir) {
    res.writeHead(200, { "content-type": "text/html" }).end(
      `<h1>devin-remote</h1><p>Web UI not built. Run <code>npm run build</code>, or use <code>npm run dev</code> and open <a href="http://localhost:5173">http://localhost:5173</a>.</p>`,
    );
    return;
  }
  let file = path.join(webDir, path.normalize(decodeURIComponent(url.pathname)));
  const rel = path.relative(webDir, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(webDir, "index.html"); // SPA fallback
  }
  const ext = path.extname(file).toLowerCase();
  const mime = STATIC_MIME[ext] ?? "application/octet-stream";

  const send = (p: string, headers: http.OutgoingHttpHeaders) => {
    const stream = fs.createReadStream(p);
    // A file swapped/removed mid-request (e.g. rebuild) must not crash the process.
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500).end();
      else res.destroy();
    });
    stream.once("open", () => {
      res.writeHead(200, headers);
      stream.pipe(res);
    });
  };

  // Serve pre-compressed assets (scripts/compress.mjs) when the client accepts them.
  const accept = String(req.headers["accept-encoding"] ?? "");
  for (const [enc, suffix] of [["br", ".br"], ["gzip", ".gz"]] as const) {
    if (accept.includes(enc) && fs.existsSync(file + suffix)) {
      send(file + suffix, { "content-type": mime, "content-encoding": enc });
      return;
    }
  }
  send(file, { "content-type": mime });
}

httpServer.on("request", (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      if (!isAllowedRequest(req)) {
        res.writeHead(403, { "content-type": "application/json" }).end(
          JSON.stringify({
            error: "forbidden origin/host — set DEVIN_REMOTE_ALLOWED_HOSTS for reverse proxies and tunnels",
          }),
        );
        return;
      }
      void handleApi(ctx, req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch {
    // Malformed requests (bad % escapes, bogus Host) must never take down the
    // process — an uncaught throw in this handler kills the whole server.
    if (!res.headersSent) res.writeHead(400).end("bad request");
    else res.destroy();
  }
});

// ---- go --------------------------------------------------------------------
httpServer.listen(PORT, HOST, async () => {
  const addr = `http://${HOST}:${PORT}`;
  console.log(`devin-remote ${pkg.version} listening on ${addr}`);
  const check = await devinCheck();
  if (!check.installed) {
    console.warn("⚠  devin CLI not found on PATH — install it first: https://docs.devin.ai/cli");
  } else if (!check.authed) {
    console.warn("⚠  devin CLI is not logged in — run: devin auth login");
  }
  if (wantOpen) {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(opener, [addr], () => {});
  }
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    manager.killAll();
    store.flush();
    process.exit(0);
  });
}
