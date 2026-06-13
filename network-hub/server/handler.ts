import { AuthError, ForbiddenError, authenticate, requireAuth } from "./auth/middleware";
import { signOAuthState, signToken, verifyOAuthState, verifyToken } from "./auth/jwt";
import { hashPassword, validatePassword, validateUsername, verifyPassword } from "./auth/passwords";
import { config, getConfigStatus } from "./config";
import {
  createUser,
  deleteContact,
  dismissAdvisor,
  getContact,
  getDebrief,
  getGoals,
  getGoogleTokens,
  getMeeting,
  getMeetingShared,
  getUserByUsername,
  getUserMeta,
  listContacts,
  listFollowUps,
  listMeetings,
  listPastMeetings,
  countTeamAgendaItems,
  saveDebrief,
  saveFollowUp,
  setGoals,
} from "./db";
import { enrichContactAfterSave, enrichDebriefAfterSave } from "./services/agent";
import { getSuggestions, refreshAdvisor, syncGoalsFromNetwork, getAllGoalOptions } from "./services/advisor";
import { createContact, updateContact } from "./services/contacts";
import { syncContactAndUserGoals } from "./services/goals";
import {
  exchangeGoogleCode,
  getGoogleAuthUrl,
  isGoogleConnected,
  syncGoogleCalendar,
} from "./services/google-calendar";
import { computeLinkSuggestions, linkPersonToMeeting } from "./services/link-suggestions";
import {
  createConversation,
  getContactConversations,
  getVisibleConversations,
  removeConversation,
  updateConversation,
} from "./services/conversations";
import { backfillMeetingLinks, listMeetingsForContact } from "./services/network-sync";
import { enrichLinkedInProfile } from "./services/linkedin-enrich";
import { parseLinkedInResumePdf } from "./services/linkedin-pdf";
import { getOrCreatePrep } from "./services/prep";
import {
  addTeamAgendaItem,
  getTeamAgenda,
  refineTeamAgendaAsync,
  removeTeamAgendaItem,
  suggestTagsForText,
  TEAM_AGENDA_TAG_OPTIONS,
} from "./services/team-agenda";
import type { Contact, Conversation, Debrief, FollowUp } from "./types";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function parseBody<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

const corsHeaders = () => ({
  "Access-Control-Allow-Origin": config.appUrl,
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
});

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
}

export async function handleApiRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // Public
    if (path === "/api/health") return json({ ok: true });
    if (path === "/api/config/status") return json(getConfigStatus());

    if (path === "/api/auth/signup" && req.method === "POST") {
      const body = await parseBody<{ username: string; password: string }>(req);
      validateUsername(body.username);
      validatePassword(body.password);
      if (getUserByUsername(body.username)) return err("Username already taken", 409);
      const user = createUser(body.username, await hashPassword(body.password));
      const token = signToken({ id: user.id, username: user.username });
      return json({ token, user: { id: user.id, username: user.username } }, 201);
    }

    if (path === "/api/auth/login" && req.method === "POST") {
      const body = await parseBody<{ username: string; password: string }>(req);
      const user = getUserByUsername(body.username);
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        return err("Invalid username or password", 401);
      }
      const token = signToken({ id: user.id, username: user.username });
      return json({ token, user: { id: user.id, username: user.username } });
    }

    // Google OAuth callback (public — state carries user id)
    if (path === "/api/auth/google/callback" && req.method === "GET") {
      const oauthError = url.searchParams.get("error");
      if (oauthError) {
        const desc = url.searchParams.get("error_description") ?? oauthError;
        return Response.redirect(
          `${config.appUrl}/settings?google=error&reason=${encodeURIComponent(desc)}`,
        );
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        return Response.redirect(
          `${config.appUrl}/settings?google=error&reason=${encodeURIComponent("Missing code or state from Google")}`,
        );
      }
      const userId = verifyOAuthState(state);
      if (!userId) {
        return Response.redirect(
          `${config.appUrl}/settings?google=error&reason=${encodeURIComponent("OAuth session expired — try Connect again")}`,
        );
      }
      try {
        await exchangeGoogleCode(code, userId);
        return Response.redirect(`${config.appUrl}/settings?google=connected`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Token exchange failed";
        return Response.redirect(
          `${config.appUrl}/settings?google=error&reason=${encodeURIComponent(message)}`,
        );
      }
    }

    // Google OAuth start — token via Authorization header or ?access_token= (browser redirect)
    if (path === "/api/auth/google/start" && req.method === "GET") {
      if (!config.googleClientId) return err("Google Calendar not configured — add GOOGLE_CLIENT_ID to .env", 503);
      const qToken = url.searchParams.get("access_token");
      const authUser = (qToken ? verifyToken(qToken) : null) ?? authenticate(req);
      if (!authUser || authUser.username === "__oauth__") return err("Authentication required", 401);
      const state = signOAuthState(authUser.id);
      return Response.redirect(getGoogleAuthUrl(state));
    }

    const user = requireAuth(req);

    if (path === "/api/auth/me" && req.method === "GET") {
      return json({
        user,
        googleConnected: isGoogleConnected(user.id),
      });
    }

    // LinkedIn enrich (preview before save)
    if (path === "/api/contacts/enrich-linkedin" && req.method === "POST") {
      const body = await parseBody<{ url: string }>(req);
      if (!body.url) return err("LinkedIn URL required");
      const enriched = await enrichLinkedInProfile(body.url);
      return json(enriched);
    }

    if (path === "/api/contacts/parse-resume-pdf" && req.method === "POST") {
      const form = await req.formData();
      const file = form.get("file");
      const linkedinUrl = form.get("linkedin")?.toString();
      if (!(file instanceof File)) return err("PDF file required");
      const buffer = await file.arrayBuffer();
      const parsed = await parseLinkedInResumePdf(buffer, linkedinUrl);
      return json(parsed);
    }

    // Contacts — private to user
    if (path === "/api/contacts" && req.method === "GET") {
      return json(listContacts(user.id, url.searchParams.get("q") ?? undefined, url.searchParams.get("tag") ?? undefined));
    }
    if (path === "/api/contacts" && req.method === "POST") {
      const body = await parseBody<Partial<Contact>>(req);
      if (!body.name) return err("name required");
      const created = createContact(user.id, user.username, body as Parameters<typeof createContact>[2]);
      const synced = syncContactAndUserGoals(user.id, created);
      if (synced.addedGoals.length > 0 || synced.contact.goalTags.length !== created.goalTags.length) {
        const { saveContact } = await import("./db");
        saveContact(synced.contact);
      }
      const { contact, agent } = await enrichContactAfterSave(synced.contact, true);
      backfillMeetingLinks(user.id);
      refreshAdvisor(user.id);
      return json({ contact, agent }, 201);
    }
    if (path.match(/^\/api\/contacts\/[^/]+\/meetings$/) && req.method === "GET") {
      const id = path.split("/")[3];
      if (!getContact(user.id, id)) return err("Not found", 404);
      return json(listMeetingsForContact(user.id, id));
    }
    if (path.match(/^\/api\/contacts\/[^/]+\/conversations$/) && req.method === "GET") {
      const id = path.split("/")[3];
      try {
        return json(getContactConversations(user.id, id));
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 404);
      }
    }
    if (path.match(/^\/api\/contacts\/[^/]+\/conversations$/) && req.method === "POST") {
      const contactId = path.split("/")[3];
      const body = await parseBody<{
        notes: string;
        visibility?: Conversation["visibility"];
        occurredAt?: string;
        meetingId?: string;
      }>(req);
      try {
        const conversation = createConversation(user.id, user.username, { ...body, contactId });
        return json(conversation, 201);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 400);
      }
    }
    if (path.match(/^\/api\/contacts\/[^/]+$/) && req.method === "GET") {
      const id = path.split("/").pop()!;
      const c = getContact(user.id, id);
      return c ? json(c) : err("Not found", 404);
    }
    if (path.match(/^\/api\/contacts\/[^/]+$/) && req.method === "PATCH") {
      const id = path.split("/").pop()!;
      const body = await parseBody<Partial<Contact>>(req);
      let updated = updateContact(user.id, id, body);
      const synced = syncContactAndUserGoals(user.id, updated);
      if (synced.addedGoals.length > 0 || synced.contact.goalTags.length !== updated.goalTags.length) {
        updated = synced.contact;
        const { saveContact } = await import("./db");
        saveContact(updated);
      }
      const { contact, agent } = await enrichContactAfterSave(updated, false);
      backfillMeetingLinks(user.id);
      refreshAdvisor(user.id);
      return json({ contact, agent });
    }
    if (path.match(/^\/api\/contacts\/[^/]+$/) && req.method === "DELETE") {
      deleteContact(user.id, path.split("/").pop()!);
      return json({ ok: true });
    }

    // Calendar
    if (path === "/api/calendar/sync" && req.method === "POST") {
      if (!isGoogleConnected(user.id)) {
        return err("Connect Google Calendar first — go to Settings", 400);
      }
      return json(await syncGoogleCalendar(user.id, user.username));
    }
    if (path === "/api/calendar/link-suggestions" && req.method === "GET") {
      return json({ suggestions: computeLinkSuggestions(user.id, true) });
    }
    if (path === "/api/calendar/incomplete-profiles" && req.method === "GET") {
      const upcoming = url.searchParams.get("upcoming") !== "false";
      return json({ suggestions: computeLinkSuggestions(user.id, upcoming) });
    }
    if (path === "/api/meetings/upcoming" && req.method === "GET") {
      return json(
        listMeetings(user.id, true).map((m) => ({
          ...m,
          teamAgendaCount: countTeamAgendaItems(m.id),
        })),
      );
    }
    if (path === "/api/meetings/past" && req.method === "GET") {
      return json(listPastMeetings(user.id));
    }
    if (path.match(/^\/api\/meetings\/[^/]+$/) && req.method === "GET") {
      const id = path.split("/").pop()!;
      const m = getMeeting(user.id, id);
      return m ? json(m) : err("Not found", 404);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/link-contact$/) && req.method === "POST") {
      const meetingId = path.split("/")[3];
      const meeting = getMeeting(user.id, meetingId);
      if (!meeting) return err("Meeting not found", 404);
      const body = await parseBody<{
        personName: string;
        linkedin?: string;
        email?: string;
        contactId?: string;
        title?: string;
        company?: string;
      }>(req);
      if (!body.personName?.trim()) return err("personName required");
      const result = linkPersonToMeeting(user.id, user.username, meeting, body);
      return json(result, result.created ? 201 : 200);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/prep$/) && req.method === "GET") {
      const id = path.split("/")[3];
      const prep = getOrCreatePrep(user.id, id);
      return prep ? json(prep) : err("Not found", 404);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda$/) && req.method === "GET") {
      const meetingId = path.split("/")[3];
      if (!getMeeting(user.id, meetingId) && !getMeetingShared(meetingId)) {
        return err("Meeting not found", 404);
      }
      return json(getTeamAgenda(meetingId));
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda\/suggest-tags$/) && req.method === "POST") {
      const body = await parseBody<{ text: string }>(req);
      return json({ tags: suggestTagsForText(body.text ?? "", user.id), options: TEAM_AGENDA_TAG_OPTIONS });
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda\/refine$/) && req.method === "POST") {
      const meetingId = path.split("/")[3];
      const refined = await refineTeamAgendaAsync(meetingId);
      return json({ refined, ...getTeamAgenda(meetingId) });
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda$/) && req.method === "POST") {
      const meetingId = path.split("/")[3];
      const body = await parseBody<{ text: string; tags?: string[] }>(req);
      if (!body.text?.trim()) return err("text required");
      const bundle = await addTeamAgendaItem(meetingId, user.id, user.username, body.text, body.tags);
      return json(bundle, 201);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda\/[^/]+$/) && req.method === "DELETE") {
      const parts = path.split("/");
      const meetingId = parts[3];
      const itemId = parts[5];
      const bundle = await removeTeamAgendaItem(meetingId, itemId, user.id);
      return json(bundle);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/debrief$/) && req.method === "GET") {
      const id = path.split("/")[3];
      return json(getDebrief(user.id, id) ?? null);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/debrief$/) && req.method === "POST") {
      const meetingId = path.split("/")[3];
      const meeting = getMeeting(user.id, meetingId);
      if (!meeting) return err("Meeting not found", 404);
      const body = await parseBody<Omit<Debrief, "meetingId" | "createdAt" | "ownerId">>(req);
      const existing = getDebrief(user.id, meetingId);
      const now = new Date().toISOString();
      const debrief: Debrief = {
        ...body,
        meetingId,
        ownerId: user.id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const contacts = meeting.contactIds
        .map((id) => getContact(user.id, id))
        .filter((c): c is Contact => c !== null);
      saveDebrief(debrief, meeting, contacts, { replaceFollowUps: Boolean(existing) });
      const { debrief: enriched, agent } = await enrichDebriefAfterSave(debrief, meeting, contacts);
      return json({ debrief: enriched, agent }, existing ? 200 : 201);
    }

    // Conversations (offline chats — private or team-visible)
    if (path === "/api/conversations" && req.method === "GET") {
      return json(getVisibleConversations(user.id));
    }
    if (path === "/api/conversations" && req.method === "POST") {
      const body = await parseBody<{
        notes: string;
        contactId?: string;
        personName?: string;
        meetingId?: string;
        visibility?: Conversation["visibility"];
        occurredAt?: string;
      }>(req);
      try {
        const conversation = createConversation(user.id, user.username, body);
        return json(conversation, 201);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 400);
      }
    }
    if (path.match(/^\/api\/conversations\/[^/]+$/) && req.method === "PATCH") {
      const id = path.split("/").pop()!;
      const body = await parseBody<Partial<Pick<Conversation, "notes" | "visibility" | "occurredAt">>>(req);
      try {
        return json(updateConversation(user.id, id, body));
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 403);
      }
    }
    if (path.match(/^\/api\/conversations\/[^/]+$/) && req.method === "DELETE") {
      const id = path.split("/").pop()!;
      try {
        removeConversation(user.id, id);
        return json({ ok: true });
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 403);
      }
    }

    // Follow-ups
    if (path === "/api/follow-ups" && req.method === "GET") {
      return json(listFollowUps(user.id, true));
    }
    if (path.match(/^\/api\/follow-ups\/[^/]+$/) && req.method === "PATCH") {
      const id = path.split("/").pop()!;
      const body = await parseBody<Partial<FollowUp>>(req);
      const all = listFollowUps(user.id, false);
      const fu = all.find((f) => f.id === id);
      if (!fu) return err("Not found", 404);
      return json(saveFollowUp({ ...fu, ...body }));
    }

    // Advisor
    if (path === "/api/advisor/suggestions" && req.method === "GET") {
      return json(getSuggestions(user.id));
    }
    if (path === "/api/advisor/refresh" && req.method === "POST") {
      return json(refreshAdvisor(user.id));
    }
    if (path.match(/^\/api\/advisor\/[^/]+\/dismiss$/) && req.method === "POST") {
      dismissAdvisor(user.id, path.split("/")[3]);
      return json({ ok: true });
    }
    if (path === "/api/advisor/goals" && req.method === "GET") {
      const synced = syncGoalsFromNetwork(user.id);
      return json({
        goals: synced.activeGoals,
        allGoals: synced.allGoals,
        addedFromNetwork: synced.addedGoals,
      });
    }
    if (path === "/api/advisor/goals" && req.method === "PATCH") {
      const body = await parseBody<{ goals: string[] }>(req);
      setGoals(user.id, body.goals);
      refreshAdvisor(user.id);
      return json({
        goals: body.goals,
        allGoals: getAllGoalOptions(user.id),
        addedFromNetwork: [],
      });
    }

    if (path === "/api/meta" && req.method === "GET") {
      return json({
        lastCalendarSync: getUserMeta(user.id, "lastCalendarSync"),
        googleConnected: isGoogleConnected(user.id),
      });
    }

    return err("Not found", 404);
  } catch (e) {
    if (e instanceof AuthError) return err(e.message, 401);
    if (e instanceof ForbiddenError) return err(e.message, 403);
    const message = e instanceof Error ? e.message : "Server error";
    return err(message, 500);
  }
}
