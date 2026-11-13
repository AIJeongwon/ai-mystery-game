// 정적 파일 — public/ 아래와, node_modules 가운데 허용한 곳(/vendor/*)만 내보낸다
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { PUBLIC_DIR, NM } from "./config.js";
import { send } from "./http.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);

// /vendor/* → node_modules 안의 허용된 위치만 노출
const VENDOR = [
  ["/vendor/d3.min.js", path.join(NM, "d3", "dist", "d3.min.js")],
  ["/vendor/topojson-client.min.js", path.join(NM, "topojson-client", "dist", "topojson-client.min.js")],
  ["/vendor/world-50m.json", path.join(NM, "world-atlas", "countries-50m.json")],
  ["/vendor/pretendard/", path.join(NM, "pretendard", "dist", "web", "variable") + path.sep],
  ["/vendor/noto-serif-kr/", path.join(NM, "@fontsource", "noto-serif-kr") + path.sep],
];

function resolveStatic(urlPath) {
  for (const [prefix, target] of VENDOR) {
    if (prefix.endsWith("/")) {
      if (urlPath.startsWith(prefix)) {
        const file = path.normalize(path.join(target, urlPath.slice(prefix.length)));
        return file.startsWith(target) ? file : null;
      }
    } else if (urlPath === prefix) {
      return target;
    }
  }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  return file.startsWith(PUBLIC_DIR + path.sep) ? file : null;
}

// 압축본은 파일이 바뀔 때까지 메모리에 둔다 (JS·CSS·지도 데이터가 터널을 타고 나갈 때 크기를 줄인다)
const gzCache = new Map();
async function gzipped(file, stat) {
  const key = `${file}:${stat.size}:${Math.round(stat.mtimeMs)}`;
  let buf = gzCache.get(key);
  if (!buf) {
    buf = await new Promise((resolve, reject) => zlib.gzip(fs.readFileSync(file), { level: 6 }, (e, out) => (e ? reject(e) : resolve(out))));
    if (gzCache.size > 200) gzCache.clear();
    gzCache.set(key, buf);
  }
  return buf;
}

export async function serveStatic(req, res, urlPath) {
  const file = resolveStatic(urlPath);
  if (!file) return send(res, 403, { error: "forbidden" });
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    if (!urlPath.startsWith("/.well-known/")) console.warn("[404]", urlPath);
    return send(res, 404, { error: "not found" });
  }
  if (!stat.isFile()) return send(res, 404, { error: "not found" });
  const ext = path.extname(file).toLowerCase();
  const immutable = urlPath.startsWith("/vendor/"); // 에셋은 ETag로 재검증해 교체 즉시 반영
  const etag = `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304);
    return res.end();
  }
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    ETag: etag,
    "Cache-Control": immutable ? "public, max-age=86400" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  const wantsGzip = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  if (wantsGzip && COMPRESSIBLE.has(ext) && stat.size > 1024) {
    const buf = await gzipped(file, stat);
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", "Content-Length": buf.length, Vary: "Accept-Encoding" });
    return res.end(req.method === "HEAD" ? undefined : buf);
  }
  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}
