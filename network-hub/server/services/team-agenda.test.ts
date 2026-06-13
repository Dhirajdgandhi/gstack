import { describe, expect, test } from "bun:test";
import { suggestTagsForText } from "./team-agenda";

describe("suggestTagsForText", () => {
  test("detects fundraising keywords", () => {
    expect(suggestTagsForText("Discuss Q3 fundraise timeline", "user-1")).toContain("fundraising");
  });

  test("detects hiring keywords", () => {
    expect(suggestTagsForText("Review open eng roles", "user-1")).toContain("hiring");
  });
});
