import { describe, expect, test } from "bun:test";
import { parseLinkedInPdfText } from "./linkedin-pdf-parse";

const SAMPLE = `Jane Smith
VP of Product at StartupCo | AI & Growth
San Francisco, California, United States
Contact
jane@startup.co
www.linkedin.com/in/janesmith
Top Skills
Product Strategy, AI, Growth
Summary
15 years building B2B SaaS products for enterprise customers.
Experience
StartupCo
VP of Product
Jan 2022 - Present · 2 yrs
Leading the product organization.
Previous Co
Director of Product
2019 - 2022 · 3 yrs
Education
Stanford University
MBA, Business`;

describe("parseLinkedInPdfText", () => {
  test("extracts name, title, company from structured PDF text", () => {
    const r = parseLinkedInPdfText(SAMPLE);
    expect(r.name).toBe("Jane Smith");
    expect(r.title).toBe("VP of Product");
    expect(r.company).toBe("StartupCo");
    expect(r.email).toBe("jane@startup.co");
    expect(r.linkedin).toContain("linkedin.com/in/janesmith");
    expect(r.profile.experience.length).toBeGreaterThanOrEqual(1);
    expect(r.profile.skills).toContain("Product Strategy");
  });

  test("handles single-line blob with section markers", () => {
    const blob = SAMPLE.replace(/\n/g, " ");
    const r = parseLinkedInPdfText(blob);
    expect(r.name).toBe("Jane Smith");
    expect(r.title).toBeTruthy();
    expect(r.name.length).toBeLessThan(80);
  });
});
