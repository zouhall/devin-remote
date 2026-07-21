import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store } from "./store.js";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
};

const MAX_UPLOAD = 25 * 1024 * 1024;

export interface UploadMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
}

/**
 * Accepts a raw binary body (`POST /api/uploads?filename=x.png`) — no
 * multipart parsing needed. Returns metadata used to build ACP content blocks.
 *
 * The body is streamed to disk (never buffered whole in memory). Oversize
 * bodies are drained rather than destroyed: destroying the request socket
 * would also kill the response, so the client would see a connection reset
 * instead of the 413.
 */
export async function saveUpload(
  req: IncomingMessage,
  store: Store,
  filename: string,
): Promise<UploadMeta> {
  const clean = path.basename(filename).replace(/[^\w.\- ]/g, "_") || "file";
  const id = `${randomUUID()}-${clean}`;
  const dest = path.join(store.uploadsDir, id);
  const out = createWriteStream(dest, { flags: "wx" });
  // Persistent listener: most of a slow upload is spent awaiting the client
  // (`for await` on req), and a WriteStream error in that window (ENOSPC,
  // uploads dir removed, EACCES) with no listener attached is an unhandled
  // 'error' event — it would crash the whole process.
  let streamErr: Error | null = null;
  out.on("error", (err) => {
    streamErr = err;
  });
  const waitDrain = () =>
    new Promise<void>((resolve, reject) => {
      if (streamErr) return reject(streamErr);
      const onDrain = () => {
        out.off("error", onErr);
        resolve();
      };
      const onErr = (e: Error) => {
        out.off("drain", onDrain);
        reject(e);
      };
      out.once("drain", onDrain);
      out.once("error", onErr);
    });
  let size = 0;
  let oversize = false;
  try {
    for await (const chunk of req) {
      if (streamErr) throw streamErr;
      if (oversize) continue; // drain the rest so the 413 can be delivered
      const buf = chunk as Buffer;
      size += buf.length;
      if (size > MAX_UPLOAD) {
        oversize = true;
        continue;
      }
      if (!out.write(buf)) await waitDrain();
    }
    if (streamErr) throw streamErr;
    out.end();
    await finished(out);
  } catch (err) {
    out.destroy();
    await fs.unlink(dest).catch(() => {});
    throw err;
  }
  if (oversize) {
    await fs.unlink(dest).catch(() => {});
    throw Object.assign(new Error("upload too large (25 MiB max)"), { status: 413 });
  }
  if (size === 0) {
    await fs.unlink(dest).catch(() => {});
    throw Object.assign(new Error("empty upload"), { status: 400 });
  }
  const mime = MIME[path.extname(clean).toLowerCase()] ?? "application/octet-stream";
  return { id, name: clean, mime, size };
}

export async function serveUpload(
  store: Store,
  id: string,
  res: ServerResponse,
): Promise<void> {
  const clean = path.basename(id);
  const file = path.join(store.uploadsDir, clean);
  const ext = path.extname(clean).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  try {
    const stat = await fs.stat(file);
    const headers: Record<string, string | number> = {
      "content-type": mime,
      "content-length": stat.size,
      "cache-control": "immutable, max-age=31536000",
      // Uploads are user-supplied bytes served from our origin — never let
      // the browser sniff them into something executable.
      "x-content-type-options": "nosniff",
    };
    if (ext === ".svg") {
      // SVG can carry script; neuter it when rendered from this origin.
      headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    const stream = createReadStream(file);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500).end();
      else res.destroy();
    });
    stream.once("open", () => {
      res.writeHead(200, headers);
      stream.pipe(res);
    });
  } catch {
    res.writeHead(404).end("not found");
  }
}

export function uploadPath(store: Store, id: string): string {
  return path.join(store.uploadsDir, path.basename(id));
}
