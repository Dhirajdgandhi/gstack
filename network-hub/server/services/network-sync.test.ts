import { describe, expect, test } from "bun:test";
import { listContacts, saveMeeting } from "../db";
import { computeLinkSuggestions } from "./link-suggestions";
import { ensureNetworkFromMeetings } from "./network-sync";

describe("computeLinkSuggestions", () => {
  test("flags incomplete profile when contact auto-added without LinkedIn", () => {
    const userId = `test-links-${Date.now()}`;
    const meetingId = `gcal-test-${Date.now()}`;
    saveMeeting({
      id: meetingId,
      ownerId: userId,
      title: "Meet with Ayushi",
      start: new Date(Date.now() + 86_400_000).toISOString(),
      end: new Date(Date.now() + 90_000_000).toISOString(),
      attendeeEmails: [],
      attendeeNames: ["Ayushi"],
      contactIds: [],
      prepStatus: "none",
      debriefComplete: false,
      status: "confirmed",
      syncedAt: new Date().toISOString(),
    });

    ensureNetworkFromMeetings(userId, "tester", [
      {
        id: meetingId,
        ownerId: userId,
        title: "Meet with Ayushi",
        start: new Date(Date.now() + 86_400_000).toISOString(),
        end: new Date(Date.now() + 90_000_000).toISOString(),
        attendeeEmails: [],
        attendeeNames: ["Ayushi"],
        contactIds: [],
        prepStatus: "none",
        debriefComplete: false,
        status: "confirmed",
        syncedAt: new Date().toISOString(),
      },
    ]);

    const suggestions = computeLinkSuggestions(userId, true);
    expect(suggestions.some((s) => s.personName === "Ayushi" && s.contactId)).toBe(true);
    expect(suggestions.some((s) => s.missingFields?.includes("linkedin"))).toBe(true);
    expect(listContacts(userId).some((c) => c.name === "Ayushi")).toBe(true);
  });
});

describe("ensureNetworkFromMeetings", () => {
  test("creates stub contact and links meeting", () => {
    const userId = `test-net-${Date.now()}`;
    const meetingId = `gcal-net-${Date.now()}`;
    const meeting = {
      id: meetingId,
      ownerId: userId,
      title: "Coffee with Sam",
      start: new Date().toISOString(),
      end: new Date(Date.now() + 3_600_000).toISOString(),
      attendeeEmails: ["sam@example.com"],
      attendeeNames: ["Sam Lee"],
      contactIds: [] as string[],
      prepStatus: "none" as const,
      debriefComplete: false,
      status: "confirmed" as const,
      syncedAt: new Date().toISOString(),
    };

    const result = ensureNetworkFromMeetings(userId, "alice", [meeting]);
    expect(result.contactsCreated).toBeGreaterThanOrEqual(1);
    expect(result.meetingsLinked).toBeGreaterThanOrEqual(1);

    const contacts = listContacts(userId);
    const sam = contacts.find((c) => c.name.includes("Sam"));
    expect(sam?.autoCreated).toBe(true);
    expect(sam?.email).toBe("sam@example.com");
    expect(meeting.contactIds.length).toBeGreaterThanOrEqual(1);
  });
});
