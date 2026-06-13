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
  teamAgendaCount?: number;
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
  missingFields?: string[];
}

export interface Conversation {
  id: string;
  addedByUserId: string;
  addedByUsername: string;
  contactId?: string;
  personName?: string;
  meetingId?: string;
  notes: string;
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
  followUps: Array<{ text: string; dueDate?: string; done: boolean }>;
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

export interface TeamAgendaItem {
  id: string;
  meetingId: string;
  addedByUserId: string;
  addedByUsername: string;
  text: string;
  tags: string[];
  createdAt: string;
}

export interface RefinedAgendaSection {
  title: string;
  items: Array<{ text: string; contributors: string[]; tags: string[] }>;
}

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
  teamConfigured: boolean;
  missing: string[];
}
