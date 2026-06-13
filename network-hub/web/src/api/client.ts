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
  const data = await res.json();
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
    me: () => request<{ user: { id: string; username: string }; googleConnected: boolean }>("/auth/me"),
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
      body: { personName: string; linkedin?: string; email?: string; contactId?: string },
    ) =>
      request<{ meeting: import("../types").Meeting; contact: import("../types").Contact; created: boolean }>(
        `/meetings/${meetingId}/link-contact`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  },
  calendar: {
    sync: () =>
      request<{
        count: number;
        source: string;
        calendarId: string;
        calendarLabel: string;
        linkSuggestions: import("../types").LinkSuggestion[];
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
    goals: () => request<{ goals: string[] }>("/advisor/goals"),
    setGoals: (goals: string[]) =>
      request<{ goals: string[] }>("/advisor/goals", { method: "PATCH", body: JSON.stringify({ goals }) }),
  },
  meta: () => request<{ lastCalendarSync: string | null; googleConnected: boolean }>("/meta"),
};
