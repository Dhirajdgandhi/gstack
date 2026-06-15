import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigStatus } from "./types";
import { AXON_AI_CALENDAR_ID, parseGoogleCalendarId } from "./lib/google-calendar-id";
import { teamEmailCount } from "./lib/team-access";

const ROOT = join(import.meta.dir, "..");

function loadDotEnv(): void {
  try {
    const content = readFileSync(join(ROOT, ".env"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional .env
  }
}

loadDotEnv();

function vercelOrigin(): string | null {
  const host = process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}

export function getAppUrl(): string {
  return process.env.APP_URL ?? vercelOrigin() ?? "http://localhost:5173";
}

export function getApiUrl(): string {
  return process.env.API_URL ?? vercelOrigin() ?? `http://localhost:${Number(process.env.PORT ?? 8787)}`;
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const host = process.env.DATABASE_HOST ?? "localhost";
  const port = process.env.DATABASE_PORT ?? "5432";
  const user = process.env.DATABASE_USER ?? "networkhub";
  const password = process.env.DATABASE_PASSWORD ?? "networkhub";
  const name = process.env.DATABASE_NAME ?? "networkhub";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),

  get appUrl(): string {
    return getAppUrl();
  },

  get apiUrl(): string {
    return getApiUrl();
  },

  get dataDir(): string {
    if (process.env.NETWORK_HUB_DATA) return process.env.NETWORK_HUB_DATA;
    if (process.env.VERCEL) return "/tmp/network-hub";
    return join(homedir(), ".network-hub");
  },

  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresSec: Number(process.env.JWT_EXPIRES_SEC ?? 60 * 60 * 24 * 7),

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  get googleRedirectUri(): string {
    return process.env.GOOGLE_REDIRECT_URI ?? `${getApiUrl()}/api/auth/google/callback`;
  },
  googleCalendarIdOrUrl: process.env.GOOGLE_CALENDAR_ID ?? process.env.GOOGLE_CALENDAR_URL ?? "",

  proxycurlApiKey: process.env.PROXYCURL_API_KEY ?? "",

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",

  /** Comma-separated team roster — only these emails see shared team content. */
  get teamEmails(): string[] {
    const raw = process.env.TEAM_EMAILS ?? "";
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },

  /** Dev-only escape hatch for username/password auth. */
  allowPasswordAuth: process.env.ALLOW_PASSWORD_AUTH === "1",

  get databaseUrl(): string {
    return getDatabaseUrl();
  },
};

export function ensureJwtSecret(): string {
  if (config.jwtSecret) return config.jwtSecret;
  if (process.env.VERCEL) {
    throw new Error("JWT_SECRET is required on Vercel — set it in Project Environment Variables");
  }
  const secretPath = join(config.dataDir, ".jwt-secret");
  try {
    const existing = readFileSync(secretPath, "utf-8").trim();
    if (existing) {
      config.jwtSecret = existing;
      return existing;
    }
  } catch {
    // generate below
  }
  const generated = crypto.randomUUID() + crypto.randomUUID();
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(secretPath, generated, { mode: 0o600 });
  config.jwtSecret = generated;
  return generated;
}

export function getGoogleCalendarId(): string {
  return parseGoogleCalendarId(config.googleCalendarIdOrUrl);
}

export function getConfigStatus(): ConfigStatus {
  const missing: string[] = [];
  if (!config.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!config.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (process.env.VERCEL && !process.env.JWT_SECRET) missing.push("JWT_SECRET");
  ensureJwtSecret();

  return {
    googleCalendar: Boolean(config.googleClientId && config.googleClientSecret),
    linkedinEnrichment: Boolean(config.proxycurlApiKey),
    linkedinPdfImport: true,
    aiAgent: Boolean(config.openaiApiKey),
    jwtSecret: Boolean(config.jwtSecret),
    appUrl: config.appUrl,
    apiUrl: config.apiUrl,
    googleRedirectUri: config.googleRedirectUri,
    googleCalendarId: parseGoogleCalendarId(config.googleCalendarIdOrUrl),
    googleCalendarLabel: "Axon AI",
    teamConfigured: teamEmailCount() > 0,
    missing,
  };
}

export { AXON_AI_CALENDAR_ID };
