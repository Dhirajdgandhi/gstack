import { config, getConfigStatus } from "./config";
import { handleApiRequest } from "./handler";

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
  Bun.serve({
    port: config.port,
    async fetch(req) {
      return withCors(await handleApiRequest(req));
    },
  });

  console.log(`Network Hub API http://localhost:${config.port}`);
  const status = getConfigStatus();
  if (status.missing.length) {
    console.log(`⚠ Missing required env: ${status.missing.join(", ")} — see network-hub/.env.example`);
  }
}
