import { describe, expect, test } from "bun:test";
import { normalizeLinkedInUrl, createContact } from "./contacts";
import { ensureDb } from "../db";

describe("contacts", () => {
  test("normalizeLinkedInUrl strips query params", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/jane/?utm=1")).toBe(
      "https://www.linkedin.com/in/jane",
    );
  });

  test("createContact requires name", async () => {
    await ensureDb();
    await expect(createContact("user-1", "testuser", { name: "A" })).rejects.toThrow();
  });
});
