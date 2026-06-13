import { describe, expect, test } from "bun:test";
import { collectMeetingPersonNames, extractNamesFromTitle, namesMatch } from "./meeting-names";

describe("extractNamesFromTitle", () => {
  test("parses Meet with Ayushi", () => {
    expect(extractNamesFromTitle("Meet with Ayushi")).toEqual(["Ayushi"]);
  });

  test("parses coffee with multiple names", () => {
    expect(extractNamesFromTitle("Coffee with Ayushi & John")).toEqual(["Ayushi", "John"]);
  });
});

describe("namesMatch", () => {
  test("matches first name", () => {
    expect(namesMatch("Ayushi", "Ayushi Patel")).toBe(true);
  });
});

describe("collectMeetingPersonNames", () => {
  test("merges title and attendees", () => {
    expect(collectMeetingPersonNames("Meet with Ayushi", ["Ayushi Patel", "Zoom"])).toEqual([
      "Ayushi",
      "Ayushi Patel",
    ]);
  });
});
