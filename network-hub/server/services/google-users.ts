import { getGoogleTokens, getUserByEmail, getUserByGoogleId, getUserByUsername, saveGoogleTokens, saveUser } from "../db";
import type { GoogleTokens, User } from "../types";
import type { GoogleTokenResponse, GoogleUserInfo } from "../auth/google-auth";

function deriveUsername(email: string, name?: string): string {
  const local = email.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "") ?? "user";
  if (local.length >= 3) return local.toLowerCase();
  const fromName = name?.trim().replace(/\s+/g, ".").replace(/[^a-zA-Z0-9._-]/g, "") ?? "user";
  return fromName.length >= 3 ? fromName.toLowerCase() : `user-${local}`;
}

function uniqueUsername(base: string): string {
  let candidate = base.slice(0, 32);
  let n = 0;
  while (getUserByUsername(candidate)) {
    n += 1;
    candidate = `${base.slice(0, 28)}-${n}`;
  }
  return candidate;
}

/** Find or create a user from Google Sign-In. Links calendar tokens on first login. */
export function findOrCreateGoogleUser(
  profile: GoogleUserInfo,
  tokens: GoogleTokenResponse,
): User {
  const email = profile.email.trim().toLowerCase();
  let user = getUserByGoogleId(profile.sub) ?? getUserByEmail(email);

  if (!user) {
    const username = uniqueUsername(deriveUsername(email, profile.name));
    user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: "",
      email,
      googleId: profile.sub,
      displayName: profile.name,
      createdAt: new Date().toISOString(),
    };
    saveUser(user);
  } else {
    user = {
      ...user,
      email: user.email ?? email,
      googleId: user.googleId ?? profile.sub,
      displayName: user.displayName ?? profile.name,
    };
    saveUser(user);
  }

  const stored: GoogleTokens = {
    userId: user.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? getGoogleTokens(user.id)?.refreshToken ?? "",
    expiresAt: Date.now() + tokens.expires_in * 1000,
    updatedAt: new Date().toISOString(),
  };
  if (!stored.refreshToken) {
    throw new Error("No refresh token — revoke app access in Google Account and sign in again");
  }
  saveGoogleTokens(stored);

  return user;
}
