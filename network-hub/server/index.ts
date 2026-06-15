import { join, resolve } from "node:path";
import { config, getConfigStatus } from "./config";
import { ensureDb } from "./db";
import { handleApiRequest } from "./handler";

const WEB_ROOT = resolve(import.meta.dir, "../web/dist");

function safeWebPath(urlPath: string): string | null {
  const relative = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  const full = resolve(WEB_ROOT, relative);
  if (full !== WEB_ROOT && !full.startsWith(`${WEB_ROOT}/`)) return null;
  return full;
}

async function serveStatic(pathname: string): Promise<Response> {
  const direct = safeWebPath(pathname);
  if (direct) {
    const file = Bun.file(direct);
    if (await file.exists()) {
      const stat = await file.stat();
      if (stat.isFile()) return new Response(file);
    }
  }
  const index = Bun.file(join(WEB_ROOT, "index.html"));
  return new Response(index);
}

function withCors(res: Response): Response {
  const headers = {
    "Access-Control-Allow-Origin": config.appUrl,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

if (import.meta.main) {
  await ensureDb();

  Bun.serve({
    port: config.port,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith("/api/")) {
        return withCors(await handleApiRequest(req));
      }
      return serveStatic(pathname);
    },
  });

  console.log(`Network Hub http://localhost:${config.port}`);
  const status = getConfigStatus();
  if (status.missing.length) {
    console.log(`⚠ Missing required env: ${status.missing.join(", ")} — see network-hub/.env.example`);
  }
}
