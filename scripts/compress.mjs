/**
 * Post-build: pre-compress dist/web assets (brotli + gzip) so the server can
 * serve them directly — big first-load win over slow links.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = path.resolve(import.meta.dirname, "../dist/web");
const EXTS = new Set([".js", ".css", ".html", ".svg", ".json", ".map", ".woff2"]);
const MIN = 1024;

let count = 0;
for (const file of walk(DIR)) {
  const ext = path.extname(file).toLowerCase();
  if (!EXTS.has(ext)) continue;
  const buf = fs.readFileSync(file);
  if (buf.length < MIN) continue;
  fs.writeFileSync(file + ".gz", zlib.gzipSync(buf, { level: 9 }));
  fs.writeFileSync(file + ".br", zlib.brotliCompressSync(buf, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }));
  count++;
}
console.log(`compressed ${count} assets`);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
