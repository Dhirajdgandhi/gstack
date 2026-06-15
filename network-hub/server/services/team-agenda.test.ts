import { describe, expect, test } from "bun:test";
import { ensureDb } from "../db";
import { suggestTagsForText } from "./team-agenda";

describe("suggestTagsForText", () => {
  test("detects fundraising keywords", async () => {
    await ensureDb();
    expect(await suggestTagsForText("Discuss Q3 fundraise timeline", "user-1")).toContain("fundraising");
  });

  test("detects hiring keywords", async () => {
    await ensureDb();
    expect(await suggestTagsForText("Review open eng roles", "user-1")).toContain("hiring");
  });
});
