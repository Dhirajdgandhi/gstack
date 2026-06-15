import { config } from "../server/config";
import { ensureDb } from "../server/db";
import { handleApiRequest } from "../server/handler";
import { normalizeRequest } from "./normalize-request";

async function handle(request: Request): Promise<Response> {
  request = normalizeRequest(request);
  await ensureDb();

  const res = await handleApiRequest(request);
  res.headers.set("Access-Control-Allow-Origin", config.appUrl);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  return res;
}

/** Vercel serverless entry — Bun runtime (PostgreSQL). */
export default {
  fetch: handle,
};

export const maxDuration = 60;
