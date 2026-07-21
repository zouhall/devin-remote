import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { AcpManager } from "./manager.js";
import type { Store } from "./store.js";
import type { WsHub } from "./ws.js";
import type { SessionLog } from "./sessionlog.js";
import type { DevinAcp } from "./acp.js";
import { saveUpload, serveUpload, uploadPath } from "./uploads.js";
import { buildSessionZip } from "./export.js";
import type { UsageRecord } from "./types.js";

export interface ApiContext {
  store: Store;
  manager: AcpManager;
  hub: WsHub;
  sessionLog: SessionLog;
  appVersion: string;
  primaryCwd: string;
  devinCheck: () => Promise<unknown>;
  /** sessionId → workspace cwd (learned from list/new/load). */
  sessionCwd: Map<string, string>;
  /** permission requestId → owning acp process. */
  permissionOwner: Map<string, DevinAcp>;
}

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" }).end(data);
}

async function readBody(req: IncomingMessage, limit = 10 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  return JSON.parse(buf.toString("utf8"));
}

/** Replace uploadId references with real base64 data for ACP image blocks. */
async function normalizeBlocks(store: Store, blocks: unknown[]): Promise<ContentBlock[]> {
  const out: ContentBlock[] = [];
  for (const raw of blocks) {
    const b = raw as Record<string, unknown>;
    if (b.type === "image" && typeof b.uploadId === "string") {
      const file = await fs.readFile(uploadPath(store, b.uploadId));
      out.push({
        type: "image",
        data: file.toString("base64"),
        mimeType: String(b.mimeType ?? "image/png"),
      });
    } else {
      out.push(raw as ContentBlock);
    }
  }
  return out;
}

async function acpForSession(ctx: ApiContext, sessionId: string, cwd?: string) {
  const dir = cwd ?? ctx.sessionCwd.get(sessionId);
  if (!dir) throw Object.assign(new Error("unknown session — pass cwd"), { status: 400 });
  const acp = await ctx.manager.get(dir);
  ctx.sessionCwd.set(sessionId, dir);
  return acp;
}

export async function handleApi(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const m = req.method ?? "GET";
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]

  try {
    // GET /api/meta
    if (m === "GET" && url.pathname === "/api/meta") {
      return json(res, 200, {
        app: { name: "devin-remote", version: ctx.appVersion },
        devin: await ctx.devinCheck(),
        workspaces: ctx.store.workspaces(),
        processes: ctx.manager.status(),
        settings: ctx.store.settings,
        primaryCwd: ctx.primaryCwd,
      });
    }

    // GET /api/sessions — global session list via the primary workspace process.
    if (m === "GET" && url.pathname === "/api/sessions") {
      const acp = await ctx.manager.get(ctx.primaryCwd);
      const aliases = ctx.store.aliases();
      const sessions: unknown[] = [];
      let cursor: string | undefined;
      do {
        const page = await acp.listSessions(cursor);
        for (const s of page.sessions) {
          ctx.sessionCwd.set(s.sessionId, s.cwd);
          sessions.push({
            sessionId: s.sessionId,
            cwd: s.cwd,
            title: s.title ?? null,
            alias: aliases[s.sessionId] ?? null,
            updatedAt: (s as { updatedAt?: string }).updatedAt ?? null,
          });
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor && sessions.length < 2000);
      return json(res, 200, { sessions });
    }

    // POST /api/sessions {cwd}
    if (m === "POST" && url.pathname === "/api/sessions") {
      const body = await readJson(req);
      const cwd = String(body.cwd ?? ctx.primaryCwd);
      const acp = await ctx.manager.get(cwd);
      ctx.store.addWorkspace(cwd);
      const s = await acp.newSession(cwd);
      ctx.sessionCwd.set(s.sessionId, cwd);
      return json(res, 200, {
        sessionId: s.sessionId,
        cwd,
        modes: (s as { modes?: unknown }).modes ?? null,
      });
    }

    // /api/sessions/:id/...
    if (parts[1] === "sessions" && parts.length >= 4) {
      const id = decodeURIComponent(parts[2]);
      const action = parts[3];

      if (m === "POST" && action === "open") {
        const body = await readJson(req);
        const acp = await acpForSession(ctx, id, body.cwd as string | undefined);
        await acp.loadSession(id, acp.cwd);
        return json(res, 200, { ok: true });
      }

      if (m === "POST" && action === "prompt") {
        const body = await readJson(req);
        const blocks = await normalizeBlocks(ctx.store, (body.blocks as unknown[]) ?? []);
        if (blocks.length === 0) return json(res, 400, { error: "empty prompt" });
        const acp = await acpForSession(ctx, id, body.cwd as string | undefined);
        // Mirror the user message into the session log for export/replay.
        for (const b of blocks) {
          if (b.type === "text") {
            ctx.sessionLog.append(id, {
              sessionUpdate: "user_message_chunk",
              content: { type: "text", text: (b as { text: string }).text },
            });
          }
        }
        const done = await acp.prompt(id, blocks);
        const usage = (done as { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }).usage;
        if (usage?.totalTokens) {
          const rec: UsageRecord = {
            ts: Date.now(),
            sessionId: id,
            cwd: acp.cwd,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens,
          };
          ctx.store.recordUsage(rec);
        }
        ctx.hub.broadcast({ type: "prompt_done", sessionId: id, result: done });
        return json(res, 200, done);
      }

      if (m === "POST" && action === "cancel") {
        const body = await readJson(req);
        const acp = await acpForSession(ctx, id, body.cwd as string | undefined);
        await acp.cancel(id);
        return json(res, 200, { ok: true });
      }

      if (m === "POST" && action === "rename") {
        const body = await readJson(req);
        const title = String(body.title ?? "").trim();
        const acp = await acpForSession(ctx, id, body.cwd as string | undefined);
        ctx.store.setAlias(id, title);
        const remote = title ? await acp.renameSession(id, title) : false;
        return json(res, 200, { ok: true, remote });
      }

      if (m === "POST" && action === "config") {
        const body = await readJson(req);
        const acp = await acpForSession(ctx, id, body.cwd as string | undefined);
        const result = await acp.setConfigOption(id, String(body.configId), String(body.value));
        return json(res, 200, result ?? { ok: true });
      }

      if (m === "GET" && action === "export") {
        const zip = buildSessionZip(ctx.sessionLog, id, {
          cwd: ctx.sessionCwd.get(id) ?? null,
          alias: ctx.store.alias(id) ?? null,
          app: `devin-remote ${ctx.appVersion}`,
        });
        res.writeHead(200, {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="devin-session-${id}.zip"`,
          "content-length": zip.length,
        });
        res.end(Buffer.from(zip));
        return;
      }

      if (m === "GET" && action === "history") {
        return json(res, 200, { updates: ctx.sessionLog.get(id).map((e) => e.update) });
      }
    }

    // POST /api/permissions/:requestId {optionId | null}
    if (m === "POST" && parts[1] === "permissions" && parts.length === 3) {
      const requestId = decodeURIComponent(parts[2]);
      const body = await readJson(req);
      const owner = ctx.permissionOwner.get(requestId);
      if (!owner) return json(res, 404, { error: "permission request expired" });
      const ok = owner.resolvePermission(requestId, (body.optionId as string | null) ?? null);
      ctx.permissionOwner.delete(requestId);
      ctx.hub.broadcast({ type: "permission_resolved", requestId });
      return json(res, ok ? 200 : 410, { ok });
    }

    // POST /api/uploads?filename=... (raw binary body)
    if (m === "POST" && url.pathname === "/api/uploads") {
      const filename = url.searchParams.get("filename") ?? "file";
      const meta = await saveUpload(req, ctx.store, filename);
      return json(res, 200, { ...meta, url: `/api/uploads/${encodeURIComponent(meta.id)}` });
    }

    // GET /api/uploads/:id
    if (m === "GET" && parts[1] === "uploads" && parts.length === 3) {
      return serveUpload(ctx.store, decodeURIComponent(parts[2]), res);
    }

    // GET /api/usage
    if (m === "GET" && url.pathname === "/api/usage") {
      const records = ctx.store.usage();
      const byDay: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; turns: number }> = {};
      let input = 0, output = 0;
      for (const r of records) {
        const day = new Date(r.ts).toISOString().slice(0, 10);
        (byDay[day] ??= { inputTokens: 0, outputTokens: 0, totalTokens: 0, turns: 0 });
        byDay[day].inputTokens += r.inputTokens;
        byDay[day].outputTokens += r.outputTokens;
        byDay[day].totalTokens += r.totalTokens;
        byDay[day].turns += 1;
        input += r.inputTokens;
        output += r.outputTokens;
      }
      return json(res, 200, {
        totals: { inputTokens: input, outputTokens: output, totalTokens: input + output, turns: records.length },
        byDay,
        recent: records.slice(-200).reverse(),
      });
    }

    // GET/PUT /api/settings
    if (url.pathname === "/api/settings") {
      if (m === "GET") return json(res, 200, ctx.store.settings);
      if (m === "PUT" || m === "POST") {
        const body = await readJson(req);
        return json(res, 200, ctx.store.setSettings(body));
      }
    }

    json(res, 404, { error: `not found: ${m} ${url.pathname}` });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    json(res, status, { error: err instanceof Error ? err.message : String(err) });
  }
}
