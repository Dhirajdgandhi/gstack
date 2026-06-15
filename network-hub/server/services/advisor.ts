import {
  getGoals,
  listAdvisorSuggestions,
  listContacts,
  listFollowUps,
  listMeetings,
  saveAdvisorSuggestions,
} from "../db";
import type { AdvisorSuggestion } from "../types";
import {
  contactSupportsGoal,
  countContactsForGoal,
  syncGoalsFromNetwork,
} from "./goals";

const STALE_DAYS = 90;

export async function computeAdvisorSuggestions(userId: string): Promise<AdvisorSuggestion[]> {
  await syncGoalsFromNetwork(userId);

  const contacts = await listContacts(userId);
  const followUps = await listFollowUps(userId, true);
  const goals = await getGoals(userId);
  const now = Date.now();
  const suggestions: AdvisorSuggestion[] = [];
  const doubleDownSeen = new Set<string>();

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

  for (const goal of goals) {
    const count = countContactsForGoal(contacts, goal);
    if (count === 0) {
      suggestions.push({
        id: crypto.randomUUID(),
        ownerId: userId,
        type: "gap",
        title: `Add a ${goal} contact`,
        rationale: `Your network has no one aligned with "${goal}" yet — tag contacts or add someone in this space.`,
        priority: 4,
        archetype: goal,
      });
    }
  }

  for (const c of contacts) {
    for (const goal of goals) {
      if (!contactSupportsGoal(c, goal)) continue;
      const key = `${c.id}:${goal.toLowerCase()}`;
      if (doubleDownSeen.has(key)) continue;
      doubleDownSeen.add(key);
      const tagHint = c.tags.length ? c.tags.join(", ") : c.title ?? "network fit";
      suggestions.push({
        id: crypto.randomUUID(),
        ownerId: userId,
        type: "double-down",
        title: `Double down with ${c.name} for ${goal}`,
        rationale: `${c.name} (${tagHint}) supports your ${goal} goal — schedule a focused conversation.`,
        priority: 3,
        contactId: c.id,
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

  const upcoming = await listMeetings(userId, true);
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

  suggestions.sort((a, b) => b.priority - a.priority);
  await saveAdvisorSuggestions(userId, suggestions);
  return suggestions;
}

export async function refreshAdvisor(userId: string): Promise<AdvisorSuggestion[]> {
  return computeAdvisorSuggestions(userId);
}

export async function getSuggestions(userId: string): Promise<AdvisorSuggestion[]> {
  await syncGoalsFromNetwork(userId);
  const existing = await listAdvisorSuggestions(userId);
  if (existing.length === 0) return computeAdvisorSuggestions(userId);
  return existing;
}

export { syncGoalsFromNetwork, getAllGoalOptions } from "./goals";
