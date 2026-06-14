import { config, getGoogleCalendarId } from "../config";
import { calendarEventsUrl } from "../lib/google-calendar-id";
import { collectMeetingPersonNames, namesMatch } from "../lib/meeting-names";
import { clearGoogleSyncedMeetings, listContacts, listMeetings, upsertMeetings, getGoogleTokens, saveGoogleTokens } from "../db";
import { computeLinkSuggestions } from "./link-suggestions";
import { ensureNetworkFromMeetings } from "./network-sync";
import { exchangeGoogleCode as exchangeCode } from "../auth/google-auth";
import type { GoogleCalendarEvent, GoogleTokens, LinkSuggestion, Meeting } from "../types";

export async function exchangeGoogleCode(code: string, userId: string): Promise<void> {
  const data = await exchangeCode(code);
  const existing = getGoogleTokens(userId);
  const tokens: GoogleTokens = {
    userId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existing?.refreshToken ?? "",
    expiresAt: Date.now() + data.expires_in * 1000,
    updatedAt: new Date().toISOString(),
  };
  if (!tokens.refreshToken) throw new Error("No refresh token — revoke app access in Google Account and reconnect");
  saveGoogleTokens(tokens);
}

async function refreshAccessToken(userId: string): Promise<string> {
  const tokens = getGoogleTokens(userId);
  if (!tokens) throw new Error("Google Calendar not connected — sign in with Google");
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Google token refresh failed — sign in with Google again");
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokens.accessToken = data.access_token;
  tokens.expiresAt = Date.now() + data.expires_in * 1000;
  tokens.updatedAt = new Date().toISOString();
  saveGoogleTokens(tokens);
  return tokens.accessToken;
}

function calendarAccessError(calendarId: string, status: number, body: string, userEmail?: string): Error {
  const who = userEmail ? ` (${userEmail})` : "";
  if (status === 403 || status === 404) {
    let detail = "";
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) detail = ` Google says: ${parsed.error.message}.`;
    } catch {
      // ignore
    }
    return new Error(
      `No access to the Axon AI shared calendar${who}. ` +
        "The calendar owner must invite this Google account to the shared calendar (not just sign-in to the app), then sync again." +
        detail,
    );
  }
  return new Error(`Google Calendar API error (${status}): ${body}`);
}

const PAST_SYNC_DAYS = 90;
const FUTURE_SYNC_DAYS = 14;

export async function fetchGoogleCalendarEvents(userId: string, userEmail?: string): Promise<GoogleCalendarEvent[]> {
  const accessToken = await refreshAccessToken(userId);
  const calendarId = getGoogleCalendarId();
  const timeMin = new Date(Date.now() - PAST_SYNC_DAYS * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + FUTURE_SYNC_DAYS * 86_400_000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(calendarEventsUrl(calendarId, params), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw calendarAccessError(calendarId, res.status, text, userEmail);
  }
  const body = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return body.items ?? [];
}

export async function probeGoogleCalendarAccess(
  userId: string,
  userEmail?: string,
): Promise<{
  ok: boolean;
  calendarId: string;
  calendarLabel: string;
  eventCount: number;
  error?: string;
  googleStatus?: number;
}> {
  const calendarId = getGoogleCalendarId();
  try {
    const events = await fetchGoogleCalendarEvents(userId, userEmail);
    return {
      ok: true,
      calendarId,
      calendarLabel: "Axon AI",
      eventCount: events.length,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Calendar probe failed";
    const statusMatch = message.match(/API error \((\d+)\)/);
    return {
      ok: false,
      calendarId,
      calendarLabel: "Axon AI",
      eventCount: 0,
      error: message,
      googleStatus: statusMatch ? Number(statusMatch[1]) : message.includes("No access") ? 403 : undefined,
    };
  }
}

function parseEventTime(t?: { dateTime?: string; date?: string }): string {
  if (t?.dateTime) return t.dateTime;
  if (t?.date) return `${t.date}T00:00:00.000Z`;
  return new Date().toISOString();
}

function matchContacts(userId: string, emails: string[], personNames: string[] = []): string[] {
  const contacts = listContacts(userId);
  const ids = new Set<string>();
  for (const email of emails) {
    const hit = contacts.find((c) => c.email?.toLowerCase() === email.toLowerCase());
    if (hit) ids.add(hit.id);
  }
  for (const name of personNames) {
    const hit = contacts.find((c) => namesMatch(c.name, name));
    if (hit) ids.add(hit.id);
  }
  return [...ids];
}

export function eventsToMeetings(userId: string, events: GoogleCalendarEvent[]): Meeting[] {
  const syncedAt = new Date().toISOString();
  return events
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const emails = (e.attendees ?? [])
        .map((a) => a.email)
        .filter((x): x is string => Boolean(x));
      const displayNames = (e.attendees ?? [])
        .map((a) => a.displayName?.trim())
        .filter((x): x is string => Boolean(x));
      const attendeeNames = collectMeetingPersonNames(e.summary ?? "", displayNames);
      return {
        id: `gcal-${e.id}`,
        ownerId: userId,
        googleEventId: e.id,
        title: e.summary ?? "(No title)",
        start: parseEventTime(e.start),
        end: parseEventTime(e.end),
        location: e.location,
        attendeeEmails: emails,
        attendeeNames,
        contactIds: matchContacts(userId, emails, attendeeNames),
        prepStatus: "none" as const,
        debriefComplete: false,
        status: "confirmed" as const,
        syncedAt,
      };
    });
}

export async function syncGoogleCalendar(
  userId: string,
  username: string,
  userEmail?: string,
): Promise<{
  count: number;
  source: "google";
  calendarId: string;
  calendarLabel: string;
  linkSuggestions: LinkSuggestion[];
  contactsCreated: number;
  meetingsLinked: number;
}> {
  const calendarId = getGoogleCalendarId();
  const events = await fetchGoogleCalendarEvents(userId, userEmail);
  const fresh = eventsToMeetings(userId, events);
  const existing = new Map(listMeetings(userId, false).map((m) => [m.id, m]));
  const meetings = fresh.map((m) => {
    const prev = existing.get(m.id);
    if (!prev) return m;
    return {
      ...m,
      debriefComplete: prev.debriefComplete,
      prepStatus: prev.prepStatus,
      contactIds: [...new Set([...prev.contactIds, ...m.contactIds])],
      attendeeNames: m.attendeeNames.length > 0 ? m.attendeeNames : prev.attendeeNames ?? [],
    };
  });
  clearGoogleSyncedMeetings(userId);
  upsertMeetings(userId, meetings);

  const networkSync = ensureNetworkFromMeetings(userId, username, meetings);
  const linkSuggestions = computeLinkSuggestions(userId, true);
  return {
    count: meetings.length,
    source: "google",
    calendarId,
    calendarLabel: "Axon AI",
    linkSuggestions,
    contactsCreated: networkSync.contactsCreated,
    meetingsLinked: networkSync.meetingsLinked,
  };
}

export function isGoogleConnected(userId: string): boolean {
  return getGoogleTokens(userId) !== null;
}

export { getGoogleCalendarId };
