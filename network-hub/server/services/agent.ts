import { config } from "../config";
import { getGoals, saveContact, saveDebrief } from "../db";
import type { AgentResult, Contact, Debrief, Meeting } from "../types";
import { inferGoalsFromContact, syncContactAndUserGoals } from "./goals";

interface ContactEnrichment {
  suggestedTags?: string[];
  profileSummary?: string;
  goalTags?: string[];
  notesAppend?: string;
  message: string;
}

interface DebriefEnrichment {
  summary?: string;
  learned?: string[];
  followUps?: Array<{ text: string; dueDate?: string }>;
  agendaForNext?: string[];
  message: string;
}

async function callOpenAIJson<T>(system: string, user: string): Promise<T | null> {
  if (!config.openaiApiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function heuristicContactEnrichment(contact: Contact, goals: string[]): ContactEnrichment {
  const updates: string[] = [];
  const suggestedTags: string[] = [];

  const hay = `${contact.title ?? ""} ${contact.company ?? ""} ${contact.notes ?? ""} ${contact.profileSummary ?? ""}`.toLowerCase();
  const tagRules: Array<[string, RegExp]> = [
    ["investor", /\b(vc|venture|partner|investor|capital)\b/],
    ["founder", /\b(founder|co-founder|ceo|startup)\b/],
    ["operator", /\b(operator|vp |director|head of)\b/],
    ["mentor", /\b(mentor|advisor|coach)\b/],
    ["recruiter", /\b(recruit|talent|hiring)\b/],
  ];
  for (const [tag, re] of tagRules) {
    if (re.test(hay) && !contact.tags.includes(tag)) suggestedTags.push(tag);
  }

  if (suggestedTags.length) updates.push(`Suggested tags: ${suggestedTags.join(", ")}`);

  const goalTags = inferGoalsFromContact(contact).filter((g) => !contact.goalTags.includes(g));
  if (goalTags.length) updates.push(`Aligned with goals: ${goalTags.join(", ")}`);

  let profileSummary = contact.profileSummary;
  if (!profileSummary && contact.linkedinProfile?.headline) {
    profileSummary = contact.linkedinProfile.headline;
    updates.push("Added headline as profile summary");
  }

  return {
    suggestedTags: suggestedTags.length ? suggestedTags : undefined,
    goalTags: goalTags.length ? [...new Set([...contact.goalTags, ...goalTags])] : undefined,
    profileSummary: profileSummary !== contact.profileSummary ? profileSummary : undefined,
    message: updates.length ? updates.join(". ") : "Contact saved — no gaps to fill.",
  };
}

function heuristicDebriefEnrichment(debrief: Debrief, meeting: Meeting): DebriefEnrichment {
  const updates: string[] = [];
  const raw = debrief.notes?.trim() ?? "";
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let summary = debrief.summary;
  if (!summary && raw) {
    summary = raw.length > 200 ? `${raw.slice(0, 197)}…` : raw;
    updates.push("Generated a short summary from your notes");
  }

  let learned = debrief.learned;
  if (learned.length === 0 && lines.length > 0) {
    learned = lines.slice(0, 5);
    updates.push("Pulled learnings from your meeting notes");
  }

  let agendaForNext = debrief.agendaForNext;
  if (agendaForNext.length === 0 && learned.length > 0) {
    agendaForNext = [`Follow up on: ${learned[0]}`];
    updates.push("Suggested a next-step agenda item");
  }

  return {
    summary: summary !== debrief.summary ? summary : undefined,
    learned: learned.length !== debrief.learned.length ? learned : undefined,
    agendaForNext: agendaForNext.length !== debrief.agendaForNext.length ? agendaForNext : undefined,
    message:
      updates.length > 0
        ? updates.join(". ")
        : `Debrief saved for "${meeting.title}". Add notes or learnings and we'll fill gaps.`,
  };
}

export async function enrichContactAfterSave(
  contact: Contact,
  isNew: boolean,
): Promise<{ contact: Contact; agent: AgentResult }> {
  const goals = getGoals(contact.ownerId);
  const ai = await callOpenAIJson<ContactEnrichment>(
    `You help maintain a personal CRM. Return JSON only with keys: suggestedTags (string[]), profileSummary (string), goalTags (string[]), notesAppend (string), message (string).
Only suggest fields that are missing or thin. Never invent facts not supported by the input. Use existing tags as-is; only add new relevant ones.`,
    JSON.stringify({
      contact: {
        name: contact.name,
        title: contact.title,
        company: contact.company,
        tags: contact.tags,
        goalTags: contact.goalTags,
        notes: contact.notes,
        profileSummary: contact.profileSummary,
        knownVia: contact.knownVia,
      },
      userGoals: goals,
      isNew,
    }),
  );

  const enrichment = ai ?? heuristicContactEnrichment(contact, goals);
  const applied: AgentResult["applied"] = [];
  const patched = { ...contact };

  if (enrichment.suggestedTags?.length) {
    const merged = [...new Set([...patched.tags, ...enrichment.suggestedTags])];
    if (merged.length > patched.tags.length) {
      patched.tags = merged;
      applied.push({ field: "tags", label: "Tags", value: enrichment.suggestedTags });
    }
  }
  if (enrichment.goalTags?.length && enrichment.goalTags.length > patched.goalTags.length) {
    patched.goalTags = enrichment.goalTags;
    applied.push({ field: "goalTags", label: "Goal alignment", value: enrichment.goalTags });
  }
  if (enrichment.profileSummary && !patched.profileSummary) {
    patched.profileSummary = enrichment.profileSummary;
    applied.push({ field: "profileSummary", label: "Profile summary", value: enrichment.profileSummary });
  }
  if (enrichment.notesAppend) {
    patched.notes = patched.notes ? `${patched.notes}\n\n${enrichment.notesAppend}` : enrichment.notesAppend;
    applied.push({ field: "notes", label: "Notes", value: enrichment.notesAppend });
  }

  patched.updatedAt = new Date().toISOString();
  let saved = applied.length > 0 ? saveContact(patched) : contact;

  const synced = syncContactAndUserGoals(contact.ownerId, saved);
  if (
    synced.addedGoals.length > 0 ||
    synced.contact.goalTags.length > saved.goalTags.length
  ) {
    saved = saveContact(synced.contact);
    if (synced.addedGoals.length > 0) {
      applied.push({
        field: "userGoals",
        label: "Advisor goals",
        value: synced.addedGoals,
      });
    }
    if (synced.contact.goalTags.length > contact.goalTags.length) {
      applied.push({
        field: "goalTags",
        label: "Goal alignment",
        value: synced.contact.goalTags,
      });
    }
  }

  return {
    contact: saved,
    agent: {
      message: enrichment.message,
      applied,
      aiPowered: Boolean(config.openaiApiKey && ai),
    },
  };
}

export async function enrichDebriefAfterSave(
  debrief: Debrief,
  meeting: Meeting,
  contacts: Contact[],
): Promise<{ debrief: Debrief; agent: AgentResult }> {
  const ai = await callOpenAIJson<DebriefEnrichment>(
    `You are a chief-of-staff debrief assistant. Return JSON: summary (string), learned (string[]), followUps ({text,dueDate?}[]), agendaForNext (string[]), message (string).
Only fill missing fields from provided notes/learnings. Do not invent people or commitments. Keep bullets concise.`,
    JSON.stringify({
      meeting: { title: meeting.title, start: meeting.start },
      contacts: contacts.map((c) => ({ name: c.name, company: c.company, title: c.title })),
      debrief: {
        notes: debrief.notes,
        summary: debrief.summary,
        learned: debrief.learned,
        followUps: debrief.followUps,
        agendaForNext: debrief.agendaForNext,
        mood: debrief.mood,
      },
    }),
  );

  const enrichment = ai ?? heuristicDebriefEnrichment(debrief, meeting);
  const applied: AgentResult["applied"] = [];
  const patched: Debrief = { ...debrief };

  if (enrichment.summary && !patched.summary) {
    patched.summary = enrichment.summary;
    applied.push({ field: "summary", label: "Summary", value: enrichment.summary });
  }
  if (enrichment.learned?.length && patched.learned.length === 0) {
    patched.learned = enrichment.learned;
    applied.push({ field: "learned", label: "Learnings", value: enrichment.learned });
  }
  if (enrichment.followUps?.length && patched.followUps.length === 0) {
    patched.followUps = enrichment.followUps.map((f) => ({ ...f, done: false }));
    applied.push({ field: "followUps", label: "Follow-ups", value: enrichment.followUps });
  }
  if (enrichment.agendaForNext?.length && patched.agendaForNext.length === 0) {
    patched.agendaForNext = enrichment.agendaForNext;
    applied.push({ field: "agendaForNext", label: "Next steps", value: enrichment.agendaForNext });
  }

  if (applied.length > 0) {
    saveDebrief(patched, meeting, contacts, { replaceFollowUps: true });
  }

  return {
    debrief: patched,
    agent: {
      message: enrichment.message,
      applied,
      aiPowered: Boolean(config.openaiApiKey && ai),
    },
  };
}
