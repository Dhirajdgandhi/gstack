import { verifyToken } from "./jwt";
import type { UserPublic } from "../types";

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function authenticate(req: Request): UserPublic | null {
  const token = extractBearer(req);
  if (!token) return null;
  return verifyToken(token);
}

export function requireAuth(req: Request): UserPublic {
  const user = authenticate(req);
  if (!user) throw new AuthError("Authentication required");
  return user;
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
