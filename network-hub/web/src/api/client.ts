let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (init?.body && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  let data: { error?: string } & T;
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    const preview = text.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      res.ok
        ? "Server returned invalid JSON"
        : `API error (${res.status}): ${preview.startsWith("<") ? "got HTML instead of JSON — check /api routes on deploy" : preview}`,
    );
  }
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export interface LinkedInEnrichment {
  name: string;
  title?: string;
  company?: string;
  email?: string;
  linkedin: string;
  profile: import("../types").LinkedInProfile;
  summary: string;
}

export const api = {
  config: {
    status: () => request<import("../types").ConfigStatus>("/config/status"),
  },
  auth: {
    signup: (username: string, password: string) =>
      request<{ token: string; user: { id: string; username: string } }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    login: (username: string, password: string) =>
      request<{ token: string; user: { id: string; username: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    me: () =>
      request<{
        user: { id: string; username: string; email?: string; displayName?: string };
        googleConnected: boolean;
        isTeamMember: boolean;
      }>("/auth/me"),
    googleLoginUrl: () => "/api/auth/google/login",
    googleStart: () => {
      window.location.href = `/api/auth/google/start?token=${authToken}`;
    },
  },
  contacts: {
    list: (q?: string) => request<import("../types").Contact[]>(`/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    get: (id: string) => request<import("../types").Contact>(`/contacts/${id}`),
    create: (body: Record<string, unknown>) =>
      request<{ contact: import("../types").Contact; agent: import("../types").AgentResult }>("/contacts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Record<string, unknown>) =>
      request<{ contact: import("../types").Contact; agent: import("../types").AgentResult }>(`/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    enrichLinkedIn: (url: string) =>
      request<LinkedInEnrichment>("/contacts/enrich-linkedin", { method: "POST", body: JSON.stringify({ url }) }),
    parseResumePdf: (file: File, linkedin?: string) => {
      const fd = new FormData();
      fd.append("file", file);
      if (linkedin) fd.append("linkedin", linkedin);
      return request<LinkedInEnrichment & { linkedin?: string }>("/contacts/parse-resume-pdf", { method: "POST", body: fd });
    },
    meetings: (id: string) => request<import("../types").Meeting[]>(`/contacts/${id}/meetings`),
    conversations: {
      list: (contactId: string) => request<import("../types").Conversation[]>(`/contacts/${contactId}/conversations`),
      add: (contactId: string, body: { notes: string; visibility?: "private" | "team"; occurredAt?: string; meetingId?: string }) =>
        request<import("../types").Conversation>(`/contacts/${contactId}/conversations`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
  },
  conversations: {
    list: () => request<import("../types").Conversation[]>("/conversations"),
    add: (body: {
      notes: string;
      contactId?: string;
      personName?: string;
      meetingId?: string;
      visibility?: "private" | "team";
      occurredAt?: string;
    }) =>
      request<import("../types").Conversation>("/conversations", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Pick<import("../types").Conversation, "notes" | "visibility" | "occurredAt">>) =>
      request<import("../types").Conversation>(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<{ ok: boolean }>(`/conversations/${id}`, { method: "DELETE" }),
  },
  meetings: {
    upcoming: () => request<import("../types").Meeting[]>("/meetings/upcoming"),
    past: () => request<import("../types").Meeting[]>("/meetings/past"),
    get: (id: string) => request<import("../types").Meeting>(`/meetings/${id}`),
    prep: (id: string) => request<import("../types").MeetingPrep>(`/meetings/${id}/prep`),
    debrief: (id: string) => request<import("../types").Debrief | null>(`/meetings/${id}/debrief`),
    saveDebrief: (id: string, body: object) =>
      request<{ debrief: import("../types").Debrief; agent: import("../types").AgentResult }>(
        `/meetings/${id}/debrief`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    linkContact: (
      meetingId: string,
      body: { personName: string; linkedin?: string; email?: string; contactId?: string; title?: string; company?: string },
    ) =>
      request<{ meeting: import("../types").Meeting; contact: import("../types").Contact; created: boolean }>(
        `/meetings/${meetingId}/link-contact`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    teamAgenda: {
      get: (meetingId: string) => request<import("../types").TeamAgendaBundle>(`/meetings/${meetingId}/team-agenda`),
      add: (meetingId: string, body: { text: string; tags?: string[] }) =>
        request<import("../types").TeamAgendaBundle>(`/meetings/${meetingId}/team-agenda`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      refine: (meetingId: string) =>
        request<import("../types").TeamAgendaBundle>(`/meetings/${meetingId}/team-agenda/refine`, {
          method: "POST",
        }),
      suggestTags: (meetingId: string, text: string) =>
        request<{ tags: string[]; options: string[] }>(`/meetings/${meetingId}/team-agenda/suggest-tags`, {
          method: "POST",
          body: JSON.stringify({ text }),
        }),
      remove: (meetingId: string, itemId: string) =>
        request<import("../types").TeamAgendaBundle>(`/meetings/${meetingId}/team-agenda/${itemId}`, {
          method: "DELETE",
        }),
    },
  },
  calendar: {
    sync: () =>
      request<{
        count: number;
        source: string;
        calendarId: string;
        calendarLabel: string;
        linkSuggestions: import("../types").LinkSuggestion[];
        contactsCreated: number;
        meetingsLinked: number;
      }>("/calendar/sync", { method: "POST" }),
    linkSuggestions: () =>
      request<{ suggestions: import("../types").LinkSuggestion[] }>("/calendar/link-suggestions"),
  },
  followUps: {
    list: () => request<import("../types").FollowUp[]>("/follow-ups"),
    patch: (id: string, body: object) =>
      request<import("../types").FollowUp>(`/follow-ups/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },
  advisor: {
    suggestions: () => request<import("../types").AdvisorSuggestion[]>("/advisor/suggestions"),
    refresh: () => request<import("../types").AdvisorSuggestion[]>("/advisor/refresh", { method: "POST" }),
    dismiss: (id: string) => request<{ ok: boolean }>(`/advisor/${id}/dismiss`, { method: "POST" }),
    goals: () =>
      request<{ goals: string[]; allGoals: string[]; addedFromNetwork?: string[] }>("/advisor/goals"),
    setGoals: (goals: string[]) =>
      request<{ goals: string[]; allGoals: string[]; addedFromNetwork?: string[] }>("/advisor/goals", {
        method: "PATCH",
        body: JSON.stringify({ goals }),
      }),
  },
  meta: () => request<{ lastCalendarSync: string | null; googleConnected: boolean }>("/meta"),
};
