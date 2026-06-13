import {
  getGoals,
  listAdvisorSuggestions,
  listContacts,
  listFollowUps,
  listMeetings,
  saveAdvisorSuggestions,
} from "../db";
import type { AdvisorSuggestion, Contact } from "../types";

const STALE_DAYS = 90;

export function computeAdvisorSuggestions(userId: string): AdvisorSuggestion[] {
  const contacts = listContacts(userId);
  const followUps = listFollowUps(userId, true);
  const goals = getGoals(userId);
  const now = Date.now();
  const suggestions: AdvisorSuggestion[] = [];

  for (const c of contacts) {
    const last = c.lastTouchedAt ? new Date(c.lastTouchedAt).getTime() : new Date(c.createdAt).getTime();
    const days = Math.floor((now - last) / 86_400_000);
    if (days >= STALE_DAYS) {
      suggestions.push({
        id: crypto.randomUUID(),
        ownerId: userId,
        type: "revive",
        title: `Reconnect with ${c.name}`,
        rationale: `No touch in ${days} days. ${c.knownVia ? `Known via: ${c.knownVia}.` : ""}`,
        priority: Math.min(5, 2 + Math.floor(days / 30)),
        contactId: c.id,
      });
    }
  }

  const tagCounts = countTags(contacts);
  for (const goal of goals) {
    const tag = goal.toLowerCase();
    if ((tagCounts[tag] ?? 0) === 0) {
      suggestions.push({
        id: crypto.randomUUID(),
        ownerId: userId,
        type: "gap",
        title: `Add a ${goal} contact`,
        rationale: `Your private network has no contacts tagged "${goal}".`,
        priority: 4,
        archetype: goal,
      });
    }
  }

  if (followUps.length > 0) {
    suggestions.push({
      id: crypto.randomUUID(),
      ownerId: userId,
      type: "calendar",
      title: `${followUps.length} open follow-up${followUps.length > 1 ? "s" : ""}`,
      rationale: followUps
        .slice(0, 2)
        .map((f) => f.text)
        .join("; "),
      priority: 5,
    });
  }

  const upcoming = listMeetings(userId, true);
  if (upcoming.length === 0) {
    suggestions.push({
      id: crypto.randomUUID(),
      ownerId: userId,
      type: "calendar",
      title: "Sync Google Calendar",
      rationale: "Connect Calendar in Settings to see upcoming calls.",
      priority: 4,
    });
  }

  saveAdvisorSuggestions(userId, suggestions);
  return suggestions;
}

function countTags(contacts: Contact[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of contacts) {
    for (const t of c.tags) out[t.toLowerCase()] = (out[t.toLowerCase()] ?? 0) + 1;
  }
  return out;
}

export function refreshAdvisor(userId: string): AdvisorSuggestion[] {
  return computeAdvisorSuggestions(userId);
}

export function getSuggestions(userId: string): AdvisorSuggestion[] {
  const existing = listAdvisorSuggestions(userId);
  if (existing.length === 0) return computeAdvisorSuggestions(userId);
  return existing;
}
