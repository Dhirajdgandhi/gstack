import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureJwtSecret } from "../config";

export type OAuthPurpose = "login" | "calendar";

interface OAuthStatePayload {
  purpose: OAuthPurpose;
  userId?: string;
  exp: number;
}

function b64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function signSegment(header: string, body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
}

/** Signed OAuth state — survives redirect to Google and back. */
export function signOAuthState(purpose: OAuthPurpose, userId?: string): string {
  const secret = ensureJwtSecret();
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "OAUTH" }));
  const payload: OAuthStatePayload = {
    purpose,
    userId,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = signSegment(header, body, secret);
  return `${header}.${body}.${sig}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  try {
    const secret = ensureJwtSecret();
    const [header, body, sig] = state.split(".");
    if (!header || !body || !sig) return null;
    const expected = signSegment(header, body, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlDecode(body)) as OAuthStatePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.purpose === "calendar" && !payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}
