const TITLE_PATTERNS: RegExp[] = [
  /^meet(?:ing)?\s+with\s+(.+)$/i,
  /^coffee\s+with\s+(.+)$/i,
  /^lunch\s+with\s+(.+)$/i,
  /^call\s+with\s+(.+)$/i,
  /^sync\s+with\s+(.+)$/i,
  /^chat\s+with\s+(.+)$/i,
  /^catch\s*[- ]?up\s+with\s+(.+)$/i,
  /^1:1\s+with\s+(.+)$/i,
  /^1-on-1\s+with\s+(.+)$/i,
];

const SKIP_NAME = /^(me|you|team|everyone|all|tbd|zoom|google meet)$/i;

/** Names parsed from titles like "Meet with Ayushi". */
export function extractNamesFromTitle(title: string): string[] {
  const trimmed = title.trim();
  for (const pat of TITLE_PATTERNS) {
    const m = trimmed.match(pat);
    if (m?.[1]) return splitPersonNames(m[1]);
  }
  return [];
}

export function splitPersonNames(raw: string): string[] {
  return raw
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((n) => n.trim().replace(/\s*\(.*\)\s*$/, ""))
    .filter((n) => n.length >= 2 && !SKIP_NAME.test(n));
}

export function normalizePersonName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function namesMatch(a: string, b: string): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (na === nb) return true;
  const fa = na.split(" ")[0] ?? "";
  const fb = nb.split(" ")[0] ?? "";
  if (fa.length >= 3 && fa === fb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/** Collect person names from calendar event title + attendee display names. */
export function collectMeetingPersonNames(
  title: string,
  attendeeDisplayNames: string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || SKIP_NAME.test(trimmed)) return;
    const key = normalizePersonName(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  for (const n of extractNamesFromTitle(title)) add(n);
  for (const n of attendeeDisplayNames) add(n);
  return out;
}
