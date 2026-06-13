import { config } from "../config";

/** Emails listed in TEAM_EMAILS — can see team-shared intelligence. */
export function isTeamMember(email?: string | null): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  return config.teamEmails.includes(normalized);
}

export function teamEmailCount(): number {
  return config.teamEmails.length;
}
