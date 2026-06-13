import { getGoals, listContacts, setGoals } from "../db";
import type { Contact } from "../types";

/** Default goals shown in advisor; more appear as network grows. */
export const DEFAULT_GOAL_OPTIONS = [
  "fundraising",
  "hiring",
  "GTM",
  "learning",
  "product",
  "design",
] as const;

/** Contact archetype tags → advisor goals. */
export const TAG_TO_GOALS: Record<string, string[]> = {
  investor: ["fundraising"],
  founder: ["product", "GTM"],
  operator: ["hiring", "GTM"],
  mentor: ["learning"],
  recruiter: ["hiring"],
  customer: ["GTM", "product"],
};

const KEYWORD_TO_GOALS: Array<[RegExp, string]> = [
  [/\b(vc|venture|investor|investment|fundraising|capital|angel)\b/i, "fundraising"],
  [/\b(hiring|recruit|talent|headcount)\b/i, "hiring"],
  [/\b(gtm|go-to-market|sales|marketing|revenue)\b/i, "GTM"],
  [/\b(design|ux|ui|figma|brand)\b/i, "design"],
  [/\b(product|pm\b|roadmap|feature)\b/i, "product"],
  [/\b(learn|mentor|coach|study|education)\b/i, "learning"],
];

function canonicalGoal(g: string): string {
  const t = g.trim();
  const known = DEFAULT_GOAL_OPTIONS.find((d) => d.toLowerCase() === t.toLowerCase());
  return known ?? t;
}

/** Infer advisor goals from a contact's tags, title, company, notes. */
export function inferGoalsFromContact(contact: Contact): string[] {
  const out = new Set<string>(contact.goalTags.map(canonicalGoal));

  for (const tag of contact.tags) {
    for (const g of TAG_TO_GOALS[tag.toLowerCase()] ?? []) out.add(g);
  }

  const hay = [
    contact.title,
    contact.company,
    contact.notes,
    contact.profileSummary,
    contact.linkedinProfile?.headline,
    contact.linkedinProfile?.summary,
  ]
    .filter(Boolean)
    .join(" ");

  for (const [re, goal] of KEYWORD_TO_GOALS) {
    if (re.test(hay)) out.add(goal);
  }

  return [...out];
}

export function contactSupportsGoal(contact: Contact, goal: string): boolean {
  const g = goal.toLowerCase();
  if (contact.goalTags.some((t) => t.toLowerCase() === g)) return true;
  return inferGoalsFromContact(contact).some((x) => x.toLowerCase() === g);
}

/** All goal chips to show: defaults + active + anything inferred from the network. */
export function getAllGoalOptions(userId: string): string[] {
  const active = getGoals(userId);
  const fromNetwork = listContacts(userId).flatMap(inferGoalsFromContact);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of [...DEFAULT_GOAL_OPTIONS, ...active, ...fromNetwork]) {
    const c = canonicalGoal(g);
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * After contact attributes change, merge inferred goals into user active goals
 * and return updated contact goalTags.
 */
export function syncContactAndUserGoals(
  userId: string,
  contact: Contact,
): { contact: Contact; addedGoals: string[] } {
  const inferred = inferGoalsFromContact(contact);
  const mergedContactTags = [...new Set([...contact.goalTags.map(canonicalGoal), ...inferred])];
  const active = getGoals(userId);
  const activeLower = new Set(active.map((g) => g.toLowerCase()));
  const addedGoals: string[] = [];

  for (const g of inferred) {
    if (!activeLower.has(g.toLowerCase())) {
      addedGoals.push(g);
      activeLower.add(g.toLowerCase());
    }
  }

  if (addedGoals.length > 0) {
    setGoals(userId, [...active, ...addedGoals.map(canonicalGoal)]);
  }

  return {
    contact: { ...contact, goalTags: mergedContactTags },
    addedGoals,
  };
}

/** Re-scan entire network and activate any goals implied by contact attributes. */
export function syncGoalsFromNetwork(userId: string): {
  activeGoals: string[];
  allGoals: string[];
  addedGoals: string[];
} {
  const contacts = listContacts(userId);
  const active = getGoals(userId);
  const activeLower = new Set(active.map((g) => g.toLowerCase()));
  const addedGoals: string[] = [];

  for (const c of contacts) {
    for (const g of inferGoalsFromContact(c)) {
      if (!activeLower.has(g.toLowerCase())) {
        addedGoals.push(g);
        activeLower.add(g.toLowerCase());
      }
    }
  }

  const nextActive =
    addedGoals.length > 0 ? [...active, ...addedGoals.map(canonicalGoal)] : active;
  if (addedGoals.length > 0) setGoals(userId, nextActive);

  return {
    activeGoals: nextActive,
    allGoals: getAllGoalOptions(userId),
    addedGoals: addedGoals.map(canonicalGoal),
  };
}

export function countContactsForGoal(contacts: Contact[], goal: string): number {
  return contacts.filter((c) => contactSupportsGoal(c, goal)).length;
}
