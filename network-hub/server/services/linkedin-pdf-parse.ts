import type { LinkedInProfile } from "../types";
import { normalizeLinkedInUrl } from "./linkedin-enrich";

export interface ParsedLinkedInPdf {
  name: string;
  title?: string;
  company?: string;
  email?: string;
  linkedin?: string;
  profile: LinkedInProfile;
  summary: string;
}

const SECTION_MARKERS = [
  "contact",
  "top skills",
  "skills",
  "summary",
  "about",
  "experience",
  "education",
  "licenses & certifications",
  "certifications",
  "honors & awards",
  "languages",
  "interests",
];

const DATE_LINE =
  /^((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—]\s*((Present|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})|\d{4})/i;

function splitIntoLines(text: string): string[] {
  let normalized = text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  for (const marker of SECTION_MARKERS) {
    const re = new RegExp("\\s+(" + marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\s+", "gi");
    normalized = normalized.replace(re, "\n$1\n");
  }
  return normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^page\s+\d+/i.test(l));
}

function extractName(lines: string[]): string {
  const first = lines[0] ?? "Unknown";
  if (first.length <= 60 && !first.includes(" at ") && !/\b(VP|CEO|CTO|Director|Engineer|Manager)\b/i.test(first)) {
    return first;
  }
  const blob = first.length > 60 ? first : lines.slice(0, 3).join(" ");
  const roleSplit = blob.match(/^(.+?)\s+(?=(VP|CEO|CTO|COO|CFO|Director|Head|Lead|Senior|Staff|Principal|Engineer|Manager|Founder|Product|Software|Designer)\b)/i);
  if (roleSplit) return roleSplit[1].trim();
  const atSplit = blob.match(/^(.+?)\s+at\s+/i);
  if (atSplit && atSplit[1].length <= 50) return atSplit[1].trim();
  const words = blob.split(/\s+/);
  if (words.length >= 2 && /^[A-Z]/.test(words[0]) && /^[A-Z]/.test(words[1])) {
    return words.slice(0, 2).join(" ");
  }
  return first.slice(0, 60).split(/[,|]/)[0].trim();
}

function isSectionHeader(line: string): boolean {
  return SECTION_MARKERS.includes(line.toLowerCase());
}

function isDateLine(line: string): boolean {
  return DATE_LINE.test(line) || /^\d{4}\s*[-–—]\s*(Present|\d{4})/i.test(line) || /·\s*\d+\s*(yr|yrs|mo|mos)/i.test(line);
}

function isLocationLine(line: string): boolean {
  return /,\s*[A-Za-z]/.test(line) && line.length < 80 && !line.includes("@") && !line.includes("http");
}

function extractLinkedInUrl(text: string): string | undefined {
  const m = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+/i);
  return m ? normalizeLinkedInUrl(m[0].startsWith("http") ? m[0] : "https://" + m[0]) : undefined;
}

function extractEmail(text: string): string | undefined {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m?.[0]?.toLowerCase();
}

function parseHeadlineLine(line: string): { title?: string; company?: string; headline: string } {
  const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    const company = atMatch[2].split("|")[0].trim();
    return { title: atMatch[1].trim(), company, headline: line };
  }
  return { title: line.split("|")[0]?.trim(), headline: line };
}

function sliceSection(lines: string[], startHeader: string, endHeaders: string[]): string[] {
  const start = lines.findIndex((l) => l.toLowerCase() === startHeader.toLowerCase());
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const endIdx = rest.findIndex((l) => endHeaders.some((h) => l.toLowerCase() === h.toLowerCase()));
  return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

function parseExperience(lines: string[]): LinkedInProfile["experience"] {
  const experience: LinkedInProfile["experience"] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isSectionHeader(line) || isDateLine(line) && i === 0) {
      i++;
      continue;
    }

    // LinkedIn PDF: Company / Title / Dates / description lines
    if (i + 2 < lines.length && isDateLine(lines[i + 2])) {
      experience.push({
        company: line,
        title: lines[i + 1],
        duration: lines[i + 2],
        description: lines[i + 3] && !isDateLine(lines[i + 3]) && !isSectionHeader(lines[i + 3]) ? lines[i + 3] : undefined,
      });
      i += lines[i + 3] && !isDateLine(lines[i + 3]) && !isSectionHeader(lines[i + 3]) ? 4 : 3;
      continue;
    }

    if (i + 1 < lines.length && isDateLine(lines[i + 1])) {
      experience.push({ title: line, duration: lines[i + 1] });
      i += 2;
      continue;
    }

    if (line.length > 2 && !isSectionHeader(line)) {
      experience.push({ title: line });
    }
    i++;
  }
  return experience.slice(0, 10);
}

function parseEducation(lines: string[]): LinkedInProfile["education"] {
  const education: LinkedInProfile["education"] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const school = lines[i];
    const degree = lines[i + 1];
    if (school && !isSectionHeader(school)) {
      education.push({ school, degree: degree && !isSectionHeader(degree) ? degree : undefined });
    }
  }
  return education.slice(0, 5);
}

export function parseLinkedInPdfText(text: string, linkedinUrl?: string): ParsedLinkedInPdf {
  const lines = splitIntoLines(text);
  const fullText = lines.join("\n");

  const name = extractName(lines);

  let headline: string | undefined;
  let title: string | undefined;
  let company: string | undefined;
  let location: string | undefined;

  const firstLine = lines[0] ?? "";
  const afterName = firstLine.startsWith(name) ? firstLine.slice(name.length).trim() : "";
  if (afterName.length >= 8) {
    headline = afterName.split(/\s+(Contact|Top Skills|Summary|Experience)\b/i)[0].trim();
    const parsed = parseHeadlineLine(headline);
    title = parsed.title;
    company = parsed.company;
  }

  const nameIdx = lines.indexOf(name);
  const startIdx = nameIdx >= 0 ? nameIdx : 0;
  for (let i = startIdx + 1; i < Math.min(startIdx + 5, lines.length); i++) {
    const line = lines[i];
    if (isSectionHeader(line) || line.includes("linkedin.com") || line.includes("@")) continue;
    if (isLocationLine(line)) {
      location = line;
      continue;
    }
    if (!headline && line.length >= 8 && line.length <= 160) {
      headline = line;
      const parsed = parseHeadlineLine(line);
      title = parsed.title;
      company = parsed.company;
    }
  }

  const linkedin = linkedinUrl ? normalizeLinkedInUrl(linkedinUrl) : extractLinkedInUrl(fullText);
  const email = extractEmail(fullText);

  const summaryLines = sliceSection(lines, "summary", ["experience", "education", "contact"]).length
    ? sliceSection(lines, "summary", ["experience", "education", "contact"])
    : sliceSection(lines, "about", ["experience", "education", "contact"]);
  const summaryText = summaryLines.join(" ").trim();

  const skillsLines = sliceSection(lines, "top skills", ["summary", "about", "experience"]);
  const skillsAlt = sliceSection(lines, "skills", ["summary", "about", "experience"]);
  const skillsRaw = [...skillsLines, ...skillsAlt].join(", ");
  const skills = skillsRaw
    .split(/[,•·|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40)
    .slice(0, 20);

  const expLines = sliceSection(lines, "experience", ["education", "licenses & certifications", "certifications", "skills"]);
  const experience = parseExperience(expLines);

  if (!title && experience[0]?.title) title = experience[0].title;
  if (!company && experience[0]?.company) company = experience[0].company;
  if (!title && experience[0]?.company && !experience[0]?.title) {
    company = experience[0].company;
  }

  const eduLines = sliceSection(lines, "education", ["licenses", "skills", "experience"]);
  const education = parseEducation(eduLines);

  const profile: LinkedInProfile = {
    headline,
    summary: summaryText || undefined,
    location,
    experience,
    education,
    skills,
  };

  const expBlock = experience.length
    ? "Experience:\n" +
      experience
        .map((e) => {
          let line = "• " + (e.title ?? "Role");
          if (e.company) line += " @ " + e.company;
          if (e.duration) line += " (" + e.duration + ")";
          return line;
        })
        .join("\n")
    : "";

  const summary = [headline, location, summaryText, expBlock, skills.length ? "Skills: " + skills.join(", ") : ""]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    name,
    title,
    company,
    email,
    linkedin,
    profile,
    summary,
  };
}
