import { describe, expect, test } from "bun:test";
import { saveMeeting } from "../db";
import { computeLinkSuggestions } from "./link-suggestions";

describe("computeLinkSuggestions", () => {
  test("flags Meet with Ayushi when not in network", () => {
    const userId = `test-links-${Date.now()}`;
    saveMeeting({
      id: `gcal-test-${Date.now()}`,
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

    const suggestions = computeLinkSuggestions(userId, true);
    expect(suggestions.some((s) => s.personName === "Ayushi" && s.reason === "no_contact")).toBe(true);
  });
});
