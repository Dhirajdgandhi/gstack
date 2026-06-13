import { describe, expect, test } from "bun:test";
import { AXON_AI_CALENDAR_ID, parseGoogleCalendarId } from "./google-calendar-id";

const AXON_URL =
  "https://calendar.google.com/calendar/u/0?cid=MDM4NDVjMmE4ZTI3OWIxYmRlNTQzMWEzM2E3Njk0ZGQ4NDYzYTNkMzA0YzE3ZTRmODYxM2RhMmYwMDViODE4OEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t";

describe("parseGoogleCalendarId", () => {
  test("decodes cid from Google Calendar share URL", () => {
    expect(parseGoogleCalendarId(AXON_URL)).toBe(AXON_AI_CALENDAR_ID);
  });

  test("passes through raw calendar id", () => {
    expect(parseGoogleCalendarId(AXON_AI_CALENDAR_ID)).toBe(AXON_AI_CALENDAR_ID);
  });

  test("defaults to Axon AI calendar when empty", () => {
    expect(parseGoogleCalendarId("")).toBe(AXON_AI_CALENDAR_ID);
  });
});
