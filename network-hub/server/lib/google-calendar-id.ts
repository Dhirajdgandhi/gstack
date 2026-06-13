/** Axon AI shared calendar — decoded from Google Calendar share link cid param. */
export const AXON_AI_CALENDAR_ID =
  "03845c2a8e279b1bde5431a33a7694dd8463a3d304c17e4f8613da2f005b8188@group.calendar.google.com";

/**
 * Resolve a Google Calendar ID from env value or share URL.
 * Share URLs look like: https://calendar.google.com/calendar/u/0?cid=BASE64...
 */
export function parseGoogleCalendarId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return AXON_AI_CALENDAR_ID;

  if (trimmed.includes("cid=")) {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : "https://" + trimmed);
      const cid = url.searchParams.get("cid");
      if (cid) {
        return Buffer.from(cid, "base64url").toString("utf-8");
      }
    } catch {
      // fall through
    }
  }

  return trimmed;
}

export function calendarEventsUrl(calendarId: string, params: URLSearchParams): string {
  return (
    "https://www.googleapis.com/calendar/v3/calendars/" +
    encodeURIComponent(calendarId) +
    "/events?" +
    params.toString()
  );
}
