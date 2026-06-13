import { config } from "../server/config";
import { handleApiRequest } from "../server/handler";

/** Vercel serverless entry — Bun runtime (uses bun:sqlite). */
export default async function (request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Catch-all may arrive without /api prefix on some hosts — normalize.
  if (!url.pathname.startsWith("/api")) {
    url.pathname = `/api${url.pathname === "/" ? "" : url.pathname}`;
    request = new Request(url.toString(), request);
  }

  const res = await handleApiRequest(request);
  res.headers.set("Access-Control-Allow-Origin", config.appUrl);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

export const maxDuration = 60;
