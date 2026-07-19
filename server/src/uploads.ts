import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
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

export interface UploadMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
}

/**
 * Accepts a raw binary body (`POST /api/uploads?filename=x.png`) — no
 * multipart parsing needed. Returns metadata used to build ACP content blocks.
 */
export async function saveUpload(
  req: IncomingMessage,
  store: Store,
  filename: string,
): Promise<UploadMeta> {
  const clean = path.basename(filename).replace(/[^\w.\- ]/g, "_") || "file";
  const id = `${randomUUID()}-${clean}`;
  const dest = path.join(store.uploadsDir, id);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const buf = Buffer.concat(chunks);
  if (buf.length === 0) throw new Error("empty upload");
  if (buf.length > 25 * 1024 * 1024) throw new Error("upload too large (25 MiB max)");
  await fs.writeFile(dest, buf);
  const mime = MIME[path.extname(clean).toLowerCase()] ?? "application/octet-stream";
  return { id, name: clean, mime, size: buf.length };
}

export async function serveUpload(
  store: Store,
  id: string,
  res: ServerResponse,
): Promise<void> {
  const clean = path.basename(id);
  const file = path.join(store.uploadsDir, clean);
  const mime = MIME[path.extname(clean).toLowerCase()] ?? "application/octet-stream";
  try {
    const stat = await fs.stat(file);
    res.writeHead(200, {
      "content-type": mime,
      "content-length": stat.size,
      "cache-control": "immutable, max-age=31536000",
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end("not found");
  }
}

export function uploadPath(store: Store, id: string): string {
  return path.join(store.uploadsDir, path.basename(id));
}
