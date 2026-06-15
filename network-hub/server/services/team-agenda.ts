import { config } from "../config";
import {
  deleteRefinedTeamAgenda,
  deleteTeamAgendaItem,
  getGoals,
  getMeetingShared,
  getRefinedTeamAgenda,
  listTeamAgendaItems,
  saveRefinedTeamAgenda,
  saveTeamAgendaItem,
} from "../db";
import type { RefinedAgendaSection, RefinedTeamAgenda, TeamAgendaBundle, TeamAgendaItem } from "../types";
import { DEFAULT_GOAL_OPTIONS } from "./goals";

const CONTRIBUTOR_TAG = (username: string) => `by:${username}`;

async function assertUpcomingMeeting(meetingId: string): Promise<{ title: string; start: string; end: string }> {
  const meeting = await getMeetingShared(meetingId);
  if (!meeting) throw new Error("Meeting not found — sync the Axon AI calendar first");
  if (new Date(meeting.end) < new Date()) throw new Error("Team agenda is only for upcoming meetings");
  return { title: meeting.title, start: meeting.start, end: meeting.end };
}

/** Suggest thematic tags from item text + user's active goals. */
export async function suggestTagsForText(text: string, userId: string): Promise<string[]> {
  const hay = text.toLowerCase();
  const tags = new Set<string>();
  const goalKeywords: Array<[RegExp, string]> = [
    [/\b(fundraise|fundraising|fund|invest|vc|raise|capital)\b/i, "fundraising"],
    [/\b(hiring|hire|recruit|talent|headcount|roles?)\b/i, "hiring"],
    [/\b(gtm|sales|market|customer|pipeline)\b/i, "GTM"],
    [/\b(design|ux|ui|brand|figma)\b/i, "design"],
    [/\b(product|roadmap|feature|ship)\b/i, "product"],
    [/\b(learn|mentor|study|feedback)\b/i, "learning"],
  ];
  for (const [re, tag] of goalKeywords) {
    if (re.test(hay)) tags.add(tag);
  }
  for (const g of await getGoals(userId)) {
    if (hay.includes(g.toLowerCase())) tags.add(g);
  }
  return [...tags];
}

function mergeTags(username: string, userTags: string[] | undefined, autoTags: string[]): string[] {
  const out = new Set<string>([CONTRIBUTOR_TAG(username), ...autoTags, ...(userTags ?? [])]);
  return [...out].filter(Boolean);
}

export async function getTeamAgenda(meetingId: string): Promise<TeamAgendaBundle> {
  const meta = await getMeetingShared(meetingId);
  return {
    items: await listTeamAgendaItems(meetingId),
    refined: await getRefinedTeamAgenda(meetingId),
    meetingTitle: meta?.title,
    meetingStart: meta?.start,
  };
}

export async function addTeamAgendaItem(
  meetingId: string,
  userId: string,
  username: string,
  text: string,
  userTags?: string[],
): Promise<TeamAgendaBundle> {
  await assertUpcomingMeeting(meetingId);
  const trimmed = text.trim();
  if (trimmed.length < 2) throw new Error("Agenda item must be at least 2 characters");

  const autoTags = await suggestTagsForText(trimmed, userId);
  const item: TeamAgendaItem = {
    id: crypto.randomUUID(),
    meetingId,
    addedByUserId: userId,
    addedByUsername: username,
    text: trimmed,
    tags: mergeTags(username, userTags, autoTags),
    createdAt: new Date().toISOString(),
  };
  await saveTeamAgendaItem(item);

  const refined = await refineTeamAgendaAsync(meetingId);
  return { ...(await getTeamAgenda(meetingId)), refined };
}

export async function removeTeamAgendaItem(
  meetingId: string,
  itemId: string,
  userId: string,
): Promise<TeamAgendaBundle> {
  await assertUpcomingMeeting(meetingId);
  const items = await listTeamAgendaItems(meetingId);
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new Error("Agenda item not found");
  if (item.addedByUserId !== userId) {
    throw new Error("Only the author can remove this item");
  }
  await deleteTeamAgendaItem(meetingId, itemId);
  const remaining = await listTeamAgendaItems(meetingId);
  const refined = remaining.length > 0 ? await refineTeamAgendaAsync(meetingId) : null;
  if (!refined) await deleteRefinedTeamAgenda(meetingId);
  return { ...(await getTeamAgenda(meetingId)), refined };
}

async function callOpenAIRefine(
  meetingTitle: string,
  meetingStart: string,
  items: TeamAgendaItem[],
): Promise<RefinedTeamAgenda | null> {
  if (!config.openaiApiKey || items.length === 0) return null;
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
          {
            role: "system",
            content: `You refine a team meeting agenda. Return JSON: summary (string, 1-2 sentences), sections (array of {title, items: [{text, contributors: string[], tags: string[]}]}). Merge duplicates, group by theme, preserve every contributor. Keep items concise. Do not invent topics.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              meeting: { title: meetingTitle, start: meetingStart },
              contributions: items.map((i) => ({
                text: i.text,
                contributor: i.addedByUsername,
                tags: i.tags.filter((t) => !t.startsWith("by:")),
              })),
            }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { summary: string; sections: RefinedAgendaSection[] };
    return {
      meetingId: items[0]!.meetingId,
      summary: parsed.summary,
      sections: parsed.sections ?? [],
      refinedAt: new Date().toISOString(),
      aiPowered: true,
      sourceItemCount: items.length,
    };
  } catch {
    return null;
  }
}

function heuristicRefine(meetingId: string, meetingTitle: string, items: TeamAgendaItem[]): RefinedTeamAgenda {
  const byTag = new Map<string, RefinedAgendaSection["items"]>();

  for (const item of items) {
    const themeTags = item.tags.filter((t) => !t.startsWith("by:"));
    const sectionKey = themeTags[0] ?? "General";
    const bucket = byTag.get(sectionKey) ?? [];
    bucket.push({
      text: item.text,
      contributors: [item.addedByUsername],
      tags: themeTags.length ? themeTags : ["general"],
    });
    byTag.set(sectionKey, bucket);
  }

  const sections: RefinedAgendaSection[] = [...byTag.entries()].map(([title, sectionItems]) => ({
    title: title.charAt(0).toUpperCase() + title.slice(1),
    items: sectionItems,
  }));

  const contributors = [...new Set(items.map((i) => i.addedByUsername))];
  return {
    meetingId,
    summary: `${items.length} item${items.length === 1 ? "" : "s"} from ${contributors.join(", ")} for "${meetingTitle}".`,
    sections,
    refinedAt: new Date().toISOString(),
    aiPowered: false,
    sourceItemCount: items.length,
  };
}

export async function refineTeamAgendaAsync(meetingId: string): Promise<RefinedTeamAgenda | null> {
  const meta = await assertUpcomingMeeting(meetingId);
  const items = await listTeamAgendaItems(meetingId);
  if (items.length === 0) {
    await deleteRefinedTeamAgenda(meetingId);
    return null;
  }

  const ai = await callOpenAIRefine(meta.title, meta.start, items);
  const refined = ai ?? heuristicRefine(meetingId, meta.title, items);
  await saveRefinedTeamAgenda(refined);
  return refined;
}

export const TEAM_AGENDA_TAG_OPTIONS = [...DEFAULT_GOAL_OPTIONS];
