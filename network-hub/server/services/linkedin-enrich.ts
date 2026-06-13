import { config } from "../config";
import type { LinkedInProfile } from "../types";

interface ProxycurlResponse {
  full_name?: string;
  headline?: string;
  summary?: string;
  city?: string;
  country?: string;
  profile_pic_url?: string;
  experiences?: Array<{
    title?: string;
    company?: string;
    starts_at?: { year?: number; month?: number };
    ends_at?: { year?: number; month?: number } | null;
    description?: string;
  }>;
  education?: Array<{ school?: string; degree_name?: string; field_of_study?: string }>;
  skills?: string[];
  personal_emails?: string[];
}

export function normalizeLinkedInUrl(url: string): string {
  const u = new URL(url.trim());
  if (!u.hostname.includes("linkedin.com")) throw new Error("Must be a linkedin.com URL");
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

function formatDuration(start?: { year?: number; month?: number }, end?: { year?: number; month?: number } | null): string {
  const sm = start?.month ? `${start.month}/${start.year}` : String(start?.year ?? "");
  const em = end ? (end.month ? `${end.month}/${end.year}` : String(end.year)) : "Present";
  return sm ? `${sm} – ${em}` : em;
}

function mapProxycurl(data: ProxycurlResponse): { profile: LinkedInProfile; name: string; title?: string; company?: string; email?: string; summary: string } {
  const location = [data.city, data.country].filter(Boolean).join(", ");
  const experience = (data.experiences ?? []).slice(0, 8).map((e) => ({
    title: e.title ?? "Role",
    company: e.company,
    duration: formatDuration(e.starts_at, e.ends_at ?? undefined),
    description: e.description,
  }));
  const education = (data.education ?? []).slice(0, 4).map((e) => ({
    school: e.school,
    degree: [e.degree_name, e.field_of_study].filter(Boolean).join(", "),
  }));
  const skills = (data.skills ?? []).slice(0, 20);

  const profile: LinkedInProfile = {
    headline: data.headline,
    summary: data.summary,
    location: location || undefined,
    experience,
    education,
    skills,
    profilePictureUrl: data.profile_pic_url,
  };

  const current = experience[0];
  const summaryParts = [
    data.headline,
    data.summary,
    experience.length ? `\nExperience:\n${experience.map((e) => `• ${e.title}${e.company ? ` @ ${e.company}` : ""} (${e.duration})`).join("\n")}` : "",
    skills.length ? `\nSkills: ${skills.join(", ")}` : "",
  ].filter(Boolean);

  return {
    profile,
    name: data.full_name ?? "Unknown",
    title: current?.title,
    company: current?.company,
    email: data.personal_emails?.[0],
    summary: summaryParts.join("\n\n").trim(),
  };
}

export async function enrichLinkedInProfile(linkedinUrl: string): Promise<ReturnType<typeof mapProxycurl> & { linkedin: string }> {
  if (!config.proxycurlApiKey) {
    throw new Error("LinkedIn URL fetch requires PROXYCURL_API_KEY (optional). Use PDF upload instead.");
  }
  const linkedin = normalizeLinkedInUrl(linkedinUrl);
  const params = new URLSearchParams({ linkedin_profile_url: linkedin });
  const res = await fetch(`https://nubela.co/proxycurl/api/v2/linkedin?${params}`, {
    headers: { Authorization: `Bearer ${config.proxycurlApiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn enrichment failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as ProxycurlResponse;
  return { ...mapProxycurl(data), linkedin };
}
