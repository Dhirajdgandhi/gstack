import { config, getGoogleCalendarId } from "../config";
import { calendarEventsUrl } from "../lib/google-calendar-id";
import { collectMeetingPersonNames, namesMatch } from "../lib/meeting-names";
import { clearGoogleSyncedMeetings, listContacts, listMeetings, upsertMeetings, getGoogleTokens, saveGoogleTokens } from "../db";
import { computeLinkSuggestions } from "./link-suggestions";
import { ensureNetworkFromMeetings } from "./network-sync";
import type { GoogleCalendarEvent, GoogleTokens, LinkSuggestion, Meeting } from "../types";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function getGoogleAuthUrl(state: string): string {
  if (!config.googleClientId) throw new Error("GOOGLE_CLIENT_ID not configured");
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string, userId: string): Promise<void> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: config.googleRedirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
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
  if (!tokens) throw new Error("Google Calendar not connected — connect in Settings");
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
  if (!res.ok) throw new Error("Google token refresh failed — reconnect Calendar in Settings");
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokens.accessToken = data.access_token;
  tokens.expiresAt = Date.now() + data.expires_in * 1000;
  tokens.updatedAt = new Date().toISOString();
  saveGoogleTokens(tokens);
  return tokens.accessToken;
}

function calendarAccessError(calendarId: string, status: number, body: string): Error {
  if (status === 403 || status === 404) {
    return new Error(
      `No access to the Axon AI shared calendar (${calendarId}). ` +
        "Ask the calendar owner to grant your Google account access, then sync again.",
    );
  }
  return new Error(`Google Calendar API error (${status}): ${body}`);
}

const PAST_SYNC_DAYS = 90;
const FUTURE_SYNC_DAYS = 14;

export async function fetchGoogleCalendarEvents(userId: string): Promise<GoogleCalendarEvent[]> {
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
    throw calendarAccessError(calendarId, res.status, text);
  }
  const body = (await res.json()) as { items?: GoogleCalendarEvent[] };
  return body.items ?? [];
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
  const events = await fetchGoogleCalendarEvents(userId);
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
