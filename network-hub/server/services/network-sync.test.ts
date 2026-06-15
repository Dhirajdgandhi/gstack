import { describe, expect, test } from "bun:test";
import { ensureDb, listContacts, saveMeeting } from "../db";
import { computeLinkSuggestions } from "./link-suggestions";
import { ensureNetworkFromMeetings } from "./network-sync";

describe("computeLinkSuggestions", () => {
  test("flags incomplete profile when contact auto-added without LinkedIn", async () => {
    await ensureDb();
    const userId = `test-links-${Date.now()}`;
    const meetingId = `gcal-test-${Date.now()}`;
    await saveMeeting({
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

    await ensureNetworkFromMeetings(userId, "tester", [
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

    const suggestions = await computeLinkSuggestions(userId, true);
    expect(suggestions.some((s) => s.personName === "Ayushi" && s.contactId)).toBe(true);
    expect(suggestions.some((s) => s.missingFields?.includes("linkedin"))).toBe(true);
    expect((await listContacts(userId)).some((c) => c.name === "Ayushi")).toBe(true);
  });
});

describe("ensureNetworkFromMeetings", () => {
  test("creates stub contact and links meeting", async () => {
    await ensureDb();
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

    const result = await ensureNetworkFromMeetings(userId, "alice", [meeting]);
    expect(result.contactsCreated).toBeGreaterThanOrEqual(1);
    expect(result.meetingsLinked).toBeGreaterThanOrEqual(1);

    const contacts = await listContacts(userId);
    const sam = contacts.find((c) => c.name.includes("Sam"));
    expect(sam?.autoCreated).toBe(true);
    expect(sam?.email).toBe("sam@example.com");
    expect(meeting.contactIds.length).toBeGreaterThanOrEqual(1);
  });
});
