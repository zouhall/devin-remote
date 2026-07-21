import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import type { ReadableStream, WritableStream } from "node:stream/web";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs/promises";
import * as acp from "@agentclientprotocol/sdk";
import type { TerminalRunner } from "./terminal.js";

export interface DevinAcpEvents {
  onSessionUpdate: (sessionId: string, update: unknown) => void;
  onAgentLog: (sessionId: string, channel: string, message: string, level: string) => void;
  onPermissionRequest: (
    requestId: string,
    sessionId: string,
    toolCall: unknown,
    options: Array<{ optionId: string; name: string; kind: string }>,
  ) => void;
  /** Fired when a pending request is resolved without the client (timeout, process exit). */
  onPermissionResolved: (requestId: string) => void;
  onTerminalOutput: (terminalId: string, sessionId: string, data: string) => void;
  onTerminalExit: (terminalId: string, sessionId: string, exitCode: number | null, signal: string | null) => void;
  onExit: (code: number | null) => void;
}

let permissionSeq = 0;

/**
 * One `devin acp` child process bound to a workspace directory, with a typed
 * ACP client connection on top of its stdio.
 */
type PendingPermission = {
  resolve: (r: acp.RequestPermissionResponse) => void;
  timer: NodeJS.Timeout;
};

export class DevinAcp {
  private proc: ChildProcess;
  private conn: acp.ClientSideConnection;
  private pendingPermissions: Map<string, PendingPermission>;
  readonly cwd: string;
  capabilities: acp.InitializeResponse | null = null;
  exited = false;

  private constructor(
    cwd: string,
    proc: ChildProcess,
    conn: acp.ClientSideConnection,
    pendingPermissions: Map<string, PendingPermission>,
  ) {
    this.cwd = cwd;
    this.proc = proc;
    this.conn = conn;
    this.pendingPermissions = pendingPermissions;
  }

  static async start(cwd: string, terminal: TerminalRunner, ev: DevinAcpEvents): Promise<DevinAcp> {
    const pendingPermissions = new Map<string, PendingPermission>();
    const proc = spawn("devin", ["acp"], {
      cwd,
      stdio: ["pipe", "pipe", "inherit"],
      env: process.env,
    });

    const client: acp.Client = {
      sessionUpdate: (params) => {
        ev.onSessionUpdate(params.sessionId, params.update);
      },

      requestPermission: (params) => {
        const requestId = `perm-${Date.now()}-${permissionSeq++}`;
        const options = (params.options ?? []).map((o) => ({
          optionId: o.optionId,
          name: o.name,
          kind: String(o.kind),
        }));
        ev.onPermissionRequest(requestId, params.sessionId, params.toolCall, options);
        return new Promise<acp.RequestPermissionResponse>((resolve) => {
          const timer = setTimeout(() => {
            pendingPermissions.delete(requestId);
            resolve({ outcome: { outcome: "cancelled" } });
            ev.onPermissionResolved(requestId);
          }, 5 * 60 * 1000);
          pendingPermissions.set(requestId, { resolve, timer });
        });
      },

      readTextFile: async (params) => {
        const p = confine(cwd, params.path);
        const content = await fs.readFile(p, "utf8");
        return { content };
      },

      writeTextFile: async (params) => {
        const p = confine(cwd, params.path);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, params.content, "utf8");
      },

      createTerminal: async (params) => {
        return terminal.create(cwd, params, ev);
      },
      terminalOutput: async (params) => terminal.output(params.terminalId),
      waitForTerminalExit: async (params) => terminal.waitForExit(params.terminalId),
      killTerminal: async (params) => {
        terminal.kill(params.terminalId);
      },
      releaseTerminal: async (params) => {
        terminal.release(params.terminalId);
      },
    };

    // Extension notifications from devin (agent log channel, MCP changes, ...).
    const clientWithExt = client as acp.Client & {
      extNotification?: (method: string, params: Record<string, unknown>) => void;
    };
    clientWithExt.extNotification = (method, params) => {
      if (method === "_cognition.ai/output") {
        ev.onAgentLog(
          String(params.sessionId ?? ""),
          String(params.channel ?? ""),
          String(params.message ?? ""),
          String(params.level ?? "info"),
        );
      }
    };

    const input = Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>;
    const output = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);
    const conn = new acp.ClientSideConnection(() => clientWithExt, stream);

    const self = new DevinAcp(cwd, proc, conn, pendingPermissions);
    let handshaken = false;
    let failStart: (err: Error) => void = () => {};
    const startFailed = new Promise<never>((_, reject) => {
      failStart = reject;
    });
    const finish = (code: number | null, err?: Error) => {
      if (self.exited) return;
      self.exited = true;
      for (const [requestId, p] of self.pendingPermissions) {
        clearTimeout(p.timer);
        p.resolve({ outcome: { outcome: "cancelled" } });
        ev.onPermissionResolved(requestId);
      }
      self.pendingPermissions.clear();
      if (!handshaken) {
        failStart(err ?? new Error(`devin acp exited (code ${code}) before the ACP handshake completed`));
      }
      ev.onExit(code);
    };
    // A missing binary emits 'error' (no 'exit'); a broken install exits
    // before the handshake. Either way the server must survive and start()
    // must reject instead of hanging.
    proc.on("error", (procErr) => finish(null, new Error(`failed to start devin acp: ${procErr.message}`)));
    proc.on("exit", (code) => finish(code));
    proc.stdin!.on("error", () => {});
    proc.stdout!.on("error", () => {});

    try {
      self.capabilities = await Promise.race([
        conn.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: true,
          },
          clientInfo: { name: "devin-remote", version: "0.1.0" },
        }),
        startFailed,
      ]);
    } catch (err) {
      // Never leave an orphaned child when the handshake fails.
      self.kill();
      throw err;
    }
    handshaken = true;
    return self;
  }

  resolvePermission(requestId: string, optionId: string | null): boolean {
    const p = this.pendingPermissions.get(requestId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pendingPermissions.delete(requestId);
    p.resolve(
      optionId === null
        ? { outcome: { outcome: "cancelled" } }
        : { outcome: { outcome: "selected", optionId } },
    );
    return true;
  }

  async newSession(cwd: string) {
    return this.conn.newSession({ cwd, mcpServers: [] });
  }

  async loadSession(sessionId: string, cwd: string) {
    return this.conn.loadSession({ sessionId, cwd, mcpServers: [] });
  }

  async listSessions(cursor?: string) {
    return this.conn.listSessions(cursor ? { cursor } : {});
  }

  async prompt(sessionId: string, blocks: acp.ContentBlock[]) {
    return this.conn.prompt({ sessionId, prompt: blocks });
  }

  async cancel(sessionId: string) {
    return this.conn.cancel({ sessionId });
  }

  async setConfigOption(sessionId: string, configId: string, value: string) {
    return this.conn.setSessionConfigOption({ sessionId, configId, value });
  }

  async renameSession(sessionId: string, title: string) {
    // Cognition advertises cognition.ai/sessionRename support; the exact
    // extension method name is not documented, so try candidates and ignore
    // "method not found" — the local alias in store.json is authoritative.
    for (const m of ["_cognition.ai/session/rename", "_cognition.ai/sessionRename", "session/rename"]) {
      try {
        await this.conn.extMethod(m, { sessionId, title });
        return true;
      } catch {
        /* try next */
      }
    }
    return false;
  }

  kill() {
    try {
      this.proc.kill("SIGTERM");
    } catch {
      /* already dead */
    }
  }
}

/** Resolve `p` against `root` and refuse escapes outside the workspace. */
function confine(root: string, p: string): string {
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw acp.RequestError.invalidParams(`path escapes workspace: ${p}`);
  }
  return abs;
}
