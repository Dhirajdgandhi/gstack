export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
}

export interface GoogleTokens {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  updatedAt: string;
}

export interface LinkedInExperience {
  title: string;
  company?: string;
  duration?: string;
  description?: string;
}

export interface LinkedInProfile {
  headline?: string;
  summary?: string;
  location?: string;
  experience: LinkedInExperience[];
  education: Array<{ school?: string; degree?: string }>;
  skills: string[];
  profilePictureUrl?: string;
}

export interface Contact {
  id: string;
  ownerId: string;
  addedByUsername: string;
  isPrivate: boolean;
  name: string;
  title?: string;
  company?: string;
  linkedin?: string;
  email?: string;
  phone?: string;
  knownVia?: string;
  tags: string[];
  notes?: string;
  goalTags: string[];
  lastTouchedAt?: string;
  pendingAgenda: string[];
  linkedinProfile?: LinkedInProfile;
  profileSummary?: string;
  enrichedFrom?: "linkedin_api" | "linkedin_pdf" | "manual" | "calendar";
  enrichedAt?: string;
  /** Stub contact auto-added from calendar sync — profile may be incomplete. */
  autoCreated?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  ownerId: string;
  googleEventId?: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  attendeeEmails: string[];
  attendeeNames: string[];
  contactIds: string[];
  prepStatus: "none" | "draft" | "ready";
  debriefComplete: boolean;
  status: "confirmed" | "cancelled";
  syncedAt: string;
}

export interface LinkSuggestion {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingStart: string;
  personName: string;
  contactId?: string;
  contactName?: string;
  reason: "incomplete_profile" | "missing_linkedin";
  /** Fields still empty — prompt user to fill in. */
  missingFields?: string[];
}

/** Offline or async conversation logged by a teammate. */
export interface Conversation {
  id: string;
  addedByUserId: string;
  addedByUsername: string;
  contactId?: string;
  personName?: string;
  meetingId?: string;
  notes: string;
  /** private = author only; team = visible to all teammates. */
  visibility: "private" | "team";
  occurredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  ownerId: string;
  contactId?: string;
  meetingId?: string;
  text: string;
  dueDate?: string;
  done: boolean;
  createdAt: string;
}

export interface Debrief {
  meetingId: string;
  ownerId: string;
  notes?: string;
  summary?: string;
  learned: string[];
  followUps: Omit<FollowUp, "id" | "createdAt" | "ownerId">[];
  agendaForNext: string[];
  mood?: "great" | "ok" | "miss";
  createdAt: string;
  updatedAt?: string;
}

export interface AgentAppliedUpdate {
  field: string;
  label: string;
  value: unknown;
}

export interface AgentResult {
  message: string;
  applied: AgentAppliedUpdate[];
  aiPowered: boolean;
}

export interface MeetingPrep {
  meetingId: string;
  ownerId: string;
  topics: Array<{ topic: string; why: string; ask: string }>;
  openLoops: string[];
  avoid: string[];
  generatedAt: string;
}

/** Team-contributed agenda item for a shared upcoming meeting. */
export interface TeamAgendaItem {
  id: string;
  meetingId: string;
  addedByUserId: string;
  addedByUsername: string;
  text: string;
  /** Thematic tags (fundraising, product) plus contributor tag `by:username`. */
  tags: string[];
  createdAt: string;
}

export interface RefinedAgendaSection {
  title: string;
  items: Array<{ text: string; contributors: string[]; tags: string[] }>;
}

/** AI-synthesized agenda from all team contributions. */
export interface RefinedTeamAgenda {
  meetingId: string;
  summary: string;
  sections: RefinedAgendaSection[];
  refinedAt: string;
  aiPowered: boolean;
  sourceItemCount: number;
}

export interface TeamAgendaBundle {
  items: TeamAgendaItem[];
  refined: RefinedTeamAgenda | null;
  meetingTitle?: string;
  meetingStart?: string;
}

export type AdvisorType = "revive" | "gap" | "intro" | "double-down" | "calendar";

export interface AdvisorSuggestion {
  id: string;
  ownerId: string;
  type: AdvisorType;
  title: string;
  rationale: string;
  priority: number;
  contactId?: string;
  archetype?: string;
  dismissedUntil?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  status?: string;
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
}

export interface ConfigStatus {
  googleCalendar: boolean;
  linkedinEnrichment: boolean;
  linkedinPdfImport: boolean;
  aiAgent: boolean;
  jwtSecret: boolean;
  appUrl: string;
  apiUrl: string;
  googleRedirectUri: string;
  googleCalendarId: string;
  googleCalendarLabel: string;
  missing: string[];
}
