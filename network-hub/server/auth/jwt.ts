import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureJwtSecret } from "../config";
import type { UserPublic } from "../types";

interface JwtPayload {
  sub: string;
  username: string;
  email?: string;
  displayName?: string;
  exp: number;
}

function b64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function signSegment(header: string, body: string, secret: string): string {
  return createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
}

export function signToken(user: UserPublic): string {
  const secret = ensureJwtSecret();
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = signSegment(header, body, secret);
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): UserPublic | null {
  try {
    const secret = ensureJwtSecret();
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = signSegment(header, body, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlDecode(body)) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      id: payload.sub,
      username: payload.username,
      email: payload.email,
      displayName: payload.displayName,
    };
  } catch {
    return null;
  }
}
