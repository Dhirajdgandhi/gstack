import { describe, expect, test } from "bun:test";
import type { Contact } from "../types";
import { inferGoalsFromContact, TAG_TO_GOALS } from "./goals";

function contact(partial: Partial<Contact>): Contact {
  return {
    id: "1",
    ownerId: "u",
    addedByUsername: "test",
    isPrivate: true,
    name: "Jagdish",
    tags: [],
    goalTags: [],
    pendingAgenda: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("inferGoalsFromContact", () => {
  test("maps investor tag to fundraising", () => {
    expect(inferGoalsFromContact(contact({ tags: ["investor"] }))).toContain("fundraising");
  });

  test("maps recruiter + VP title to hiring", () => {
    const goals = inferGoalsFromContact(
      contact({ tags: ["recruiter"], title: "VP Talent" }),
    );
    expect(goals).toContain("hiring");
  });

  test("reads design keywords from notes", () => {
    expect(inferGoalsFromContact(contact({ notes: "Great UX designer, Figma expert" }))).toContain(
      "design",
    );
  });

  test("TAG_TO_GOALS covers all archetype tags", () => {
    expect(TAG_TO_GOALS.investor).toEqual(["fundraising"]);
  });
});
