function getHeader(req: Request, name: string): string | null {
  const headers = req.headers as Headers & Record<string, string | string[] | undefined>;
  if (headers && typeof headers.get === "function") {
    return headers.get(name);
  }
  const lower = name.toLowerCase();
  const val = headers[lower] ?? headers[name];
  if (val == null) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function toHeaders(req: Request): Headers {
  const headers = req.headers as Headers & Record<string, string | string[] | undefined>;
  if (headers && typeof headers.get === "function") {
    return new Headers(headers);
  }
  const out = new Headers();
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (v == null) continue;
    out.set(k, Array.isArray(v) ? v[0] : v);
  }
  return out;
}

/**
 * Vercel hands serverless functions a relative Request URL (e.g. `/api/index?path=auth/google/login`)
 * instead of an absolute URL. Downstream `new URL(req.url)` throws. Rewrites also inject a `path`
 * query param for the original segment after `/api/`.
 */
export function normalizeRequest(req: Request): Request {
  const host = getHeader(req, "x-forwarded-host") ?? getHeader(req, "host") ?? "localhost";
  const proto = getHeader(req, "x-forwarded-proto") ?? "https";

  let pathname = "/api";
  let searchParams = new URLSearchParams();

  try {
    const parsed = new URL(req.url);
    pathname = parsed.pathname;
    searchParams = parsed.searchParams;
  } catch {
    const q = req.url.indexOf("?");
    pathname = q >= 0 ? req.url.slice(0, q) : req.url;
    if (q >= 0) searchParams = new URLSearchParams(req.url.slice(q + 1));
  }

  const rewritten = searchParams.get("path");
  if (rewritten) {
    pathname = `/api/${rewritten}`;
    searchParams.delete("path");
  }

  const query = searchParams.toString();
  const absolute = new URL(`${pathname}${query ? `?${query}` : ""}`, `${proto}://${host}`);

  const init: RequestInit = {
    method: req.method,
    headers: toHeaders(req),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    // @ts-expect-error Bun/Node need duplex for streamed request bodies
    init.duplex = "half";
  }

  return new Request(absolute.toString(), init);
}
