import { AuthError, ForbiddenError, authenticate, requireAuth } from "./auth/middleware";
import { exchangeGoogleCode as exchangeGoogleAuthCode, fetchGoogleUserInfo, getGoogleAuthUrl } from "./auth/google-auth";
import { isTeamMember } from "./lib/team-access";
import { signOAuthState, verifyOAuthState } from "./auth/oauth-state";
import { signToken, verifyToken } from "./auth/jwt";
import { hashPassword, validatePassword, validateUsername, verifyPassword } from "./auth/passwords";
import { config, getConfigStatus } from "./config";
import {
  createUser,
  deleteContact,
  dismissAdvisor,
  ensureDb,
  getContact,
  getDebrief,
  getMeeting,
  getMeetingShared,
  getUserById,
  getUserByUsername,
  getUserMeta,
  listContacts,
  listFollowUps,
  listMeetings,
  listPastMeetings,
  countTeamAgendaItems,
  saveContact,
  saveDebrief,
  saveFollowUp,
  setGoals,
} from "./db";
import { enrichContactAfterSave, enrichDebriefAfterSave } from "./services/agent";
import { getSuggestions, refreshAdvisor, syncGoalsFromNetwork, getAllGoalOptions } from "./services/advisor";
import { createContact, updateContact } from "./services/contacts";
import { syncContactAndUserGoals } from "./services/goals";
import {
  exchangeGoogleCode as saveCalendarTokens,
  isGoogleConnected,
  probeGoogleCalendarAccess,
  syncGoogleCalendar,
} from "./services/google-calendar";
import { findOrCreateGoogleUser } from "./services/google-users";
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
    if (path !== "/api/health") await ensureDb();

    if (path === "/api/health") return json({ ok: true });
    if (path === "/api/config/status") return json(getConfigStatus());

    if (path === "/api/auth/google/login" && req.method === "GET") {
      if (!config.googleClientId) return err("Google Sign-In not configured — add GOOGLE_CLIENT_ID to .env", 503);
      const state = signOAuthState("login");
      return Response.redirect(getGoogleAuthUrl(state));
    }

    if (path === "/api/auth/signup" && req.method === "POST") {
      if (!config.allowPasswordAuth) return err("Sign up is disabled — use Google Sign-In", 403);
      const body = await parseBody<{ username: string; password: string }>(req);
      validateUsername(body.username);
      validatePassword(body.password);
      if (await getUserByUsername(body.username)) return err("Username already taken", 409);
      const user = await createUser(body.username, await hashPassword(body.password));
      const token = signToken({ id: user.id, username: user.username, email: user.email });
      return json({ token, user: { id: user.id, username: user.username, email: user.email } }, 201);
    }

    if (path === "/api/auth/login" && req.method === "POST") {
      if (!config.allowPasswordAuth) return err("Password sign-in is disabled — use Google Sign-In", 403);
      const body = await parseBody<{ username: string; password: string }>(req);
      const user = await getUserByUsername(body.username);
      if (!user || !user.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
        return err("Invalid username or password", 401);
      }
      const token = signToken({ id: user.id, username: user.username, email: user.email });
      return json({ token, user: { id: user.id, username: user.username, email: user.email } });
    }

    if (path === "/api/auth/google/callback" && req.method === "GET") {
      const oauthError = url.searchParams.get("error");
      if (oauthError) {
        const desc = url.searchParams.get("error_description") ?? oauthError;
        return Response.redirect(`${config.appUrl}/login?error=${encodeURIComponent(desc)}`);
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        return Response.redirect(
          `${config.appUrl}/login?error=${encodeURIComponent("Missing code or state from Google")}`,
        );
      }
      const oauthState = verifyOAuthState(state);
      if (!oauthState) {
        return Response.redirect(
          `${config.appUrl}/login?error=${encodeURIComponent("Sign-in session expired — try again")}`,
        );
      }

      try {
        const tokenData = await exchangeGoogleAuthCode(code);
        const profile = await fetchGoogleUserInfo(tokenData.access_token);

        if (oauthState.purpose === "login") {
          const user = await findOrCreateGoogleUser(profile, tokenData);
          const jwt = signToken({
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
          });
          return Response.redirect(`${config.appUrl}/login?token=${encodeURIComponent(jwt)}`);
        }

        const userId = oauthState.userId!;
        await saveCalendarTokens(code, userId);
        return Response.redirect(`${config.appUrl}/settings?google=connected`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Google sign-in failed";
        const dest = oauthState.purpose === "login" ? "/login" : "/settings?google=error";
        const param = oauthState.purpose === "login" ? "error" : "reason";
        return Response.redirect(`${config.appUrl}${dest}?${param}=${encodeURIComponent(message)}`);
      }
    }

    if (path === "/api/auth/google/start" && req.method === "GET") {
      if (!config.googleClientId) return err("Google not configured — add GOOGLE_CLIENT_ID to .env", 503);
      const qToken = url.searchParams.get("access_token");
      const authUser = (qToken ? verifyToken(qToken) : null) ?? authenticate(req);
      if (!authUser) return err("Authentication required", 401);
      const full = await getUserById(authUser.id);
      const state = signOAuthState("calendar", authUser.id);
      return Response.redirect(getGoogleAuthUrl(state, full?.email));
    }

    const user = requireAuth(req);
    const fullUser = await getUserById(user.id);
    const userEmail = fullUser?.email ?? user.email;
    const onTeam = isTeamMember(userEmail);

    if (path === "/api/auth/me" && req.method === "GET") {
      return json({
        user: {
          id: user.id,
          username: user.username,
          email: userEmail,
          displayName: fullUser?.displayName ?? user.displayName,
        },
        googleConnected: await isGoogleConnected(user.id),
        isTeamMember: onTeam,
      });
    }

    const teamExempt = path === "/api/config/status" || path === "/api/meta";
    if (!teamExempt && !onTeam) {
      return err("Team access required — your email is not on TEAM_EMAILS", 403);
    }

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

    if (path === "/api/contacts" && req.method === "GET") {
      return json(
        await listContacts(user.id, url.searchParams.get("q") ?? undefined, url.searchParams.get("tag") ?? undefined),
      );
    }
    if (path === "/api/contacts" && req.method === "POST") {
      const body = await parseBody<Partial<Contact>>(req);
      if (!body.name) return err("name required");
      const created = await createContact(user.id, user.username, body as Parameters<typeof createContact>[2]);
      const synced = await syncContactAndUserGoals(user.id, created);
      if (synced.addedGoals.length > 0 || synced.contact.goalTags.length !== created.goalTags.length) {
        await saveContact(synced.contact);
      }
      const { contact, agent } = await enrichContactAfterSave(synced.contact, true);
      await backfillMeetingLinks(user.id);
      await refreshAdvisor(user.id);
      return json({ contact, agent }, 201);
    }
    if (path.match(/^\/api\/contacts\/[^/]+\/meetings$/) && req.method === "GET") {
      const id = path.split("/")[3];
      if (!(await getContact(user.id, id))) return err("Not found", 404);
      return json(await listMeetingsForContact(user.id, id));
    }
    if (path.match(/^\/api\/contacts\/[^/]+\/conversations$/) && req.method === "GET") {
      const id = path.split("/")[3];
      try {
        return json(await getContactConversations(user.id, id, onTeam));
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
        const conversation = await createConversation(user.id, user.username, { ...body, contactId });
        return json(conversation, 201);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 400);
      }
    }
    if (path.match(/^\/api\/contacts\/[^/]+$/) && req.method === "GET") {
      const id = path.split("/").pop()!;
      const c = await getContact(user.id, id);
      return c ? json(c) : err("Not found", 404);
    }
    if (path.match(/^\/api\/contacts\/[^/]+$/) && req.method === "PATCH") {
      const id = path.split("/").pop()!;
      const body = await parseBody<Partial<Contact>>(req);
      let updated = await updateContact(user.id, id, body);
      const synced = await syncContactAndUserGoals(user.id, updated);
      if (synced.addedGoals.length > 0 || synced.contact.goalTags.length !== updated.goalTags.length) {
        updated = synced.contact;
        await saveContact(updated);
      }
      const { contact, agent } = await enrichContactAfterSave(updated, false);
      await backfillMeetingLinks(user.id);
      await refreshAdvisor(user.id);
      return json({ contact, agent });
    }
    if (path.match(/^\/api\/contacts\/[^/]+$/) && req.method === "DELETE") {
      await deleteContact(user.id, path.split("/").pop()!);
      return json({ ok: true });
    }

    if (path === "/api/calendar/status" && req.method === "GET") {
      if (!(await isGoogleConnected(user.id))) {
        return json({
          ok: false,
          calendarId: "",
          calendarLabel: "Axon AI",
          eventCount: 0,
          error: "Google Calendar not connected — reconnect in Settings",
        });
      }
      return json(await probeGoogleCalendarAccess(user.id, fullUser?.email));
    }
    if (path === "/api/calendar/sync" && req.method === "POST") {
      if (!(await isGoogleConnected(user.id))) {
        return err("Connect Google Calendar first — go to Settings", 400);
      }
      return json(await syncGoogleCalendar(user.id, user.username, fullUser?.email));
    }
    if (path === "/api/calendar/link-suggestions" && req.method === "GET") {
      return json({ suggestions: await computeLinkSuggestions(user.id, true) });
    }
    if (path === "/api/calendar/incomplete-profiles" && req.method === "GET") {
      const upcoming = url.searchParams.get("upcoming") !== "false";
      return json({ suggestions: await computeLinkSuggestions(user.id, upcoming) });
    }
    if (path === "/api/meetings/upcoming" && req.method === "GET") {
      const meetings = await listMeetings(user.id, true);
      return json(
        await Promise.all(
          meetings.map(async (m) => ({
            ...m,
            teamAgendaCount: await countTeamAgendaItems(m.id),
          })),
        ),
      );
    }
    if (path === "/api/meetings/past" && req.method === "GET") {
      return json(await listPastMeetings(user.id));
    }
    if (path.match(/^\/api\/meetings\/[^/]+$/) && req.method === "GET") {
      const id = path.split("/").pop()!;
      const m = await getMeeting(user.id, id);
      return m ? json(m) : err("Not found", 404);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/link-contact$/) && req.method === "POST") {
      const meetingId = path.split("/")[3];
      const meeting = await getMeeting(user.id, meetingId);
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
      const result = await linkPersonToMeeting(user.id, user.username, meeting, body);
      return json(result, result.created ? 201 : 200);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/prep$/) && req.method === "GET") {
      const id = path.split("/")[3];
      const prep = await getOrCreatePrep(user.id, id);
      return prep ? json(prep) : err("Not found", 404);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda$/) && req.method === "GET") {
      const meetingId = path.split("/")[3];
      if (!(await getMeeting(user.id, meetingId)) && !(await getMeetingShared(meetingId))) {
        return err("Meeting not found", 404);
      }
      return json(await getTeamAgenda(meetingId));
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda\/suggest-tags$/) && req.method === "POST") {
      const body = await parseBody<{ text: string }>(req);
      return json({
        tags: await suggestTagsForText(body.text ?? "", user.id),
        options: TEAM_AGENDA_TAG_OPTIONS,
      });
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/team-agenda\/refine$/) && req.method === "POST") {
      const meetingId = path.split("/")[3];
      const refined = await refineTeamAgendaAsync(meetingId);
      return json({ refined, ...(await getTeamAgenda(meetingId)) });
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
      return json((await getDebrief(user.id, id)) ?? null);
    }
    if (path.match(/^\/api\/meetings\/[^/]+\/debrief$/) && req.method === "POST") {
      const meetingId = path.split("/")[3];
      const meeting = await getMeeting(user.id, meetingId);
      if (!meeting) return err("Meeting not found", 404);
      const body = await parseBody<Omit<Debrief, "meetingId" | "createdAt" | "ownerId">>(req);
      const existing = await getDebrief(user.id, meetingId);
      const now = new Date().toISOString();
      const debrief: Debrief = {
        ...body,
        meetingId,
        ownerId: user.id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const contacts = (
        await Promise.all(meeting.contactIds.map((id) => getContact(user.id, id)))
      ).filter((c): c is Contact => c !== null);
      await saveDebrief(debrief, meeting, contacts, { replaceFollowUps: Boolean(existing) });
      const { debrief: enriched, agent } = await enrichDebriefAfterSave(debrief, meeting, contacts);
      return json({ debrief: enriched, agent }, existing ? 200 : 201);
    }

    if (path === "/api/conversations" && req.method === "GET") {
      return json(await getVisibleConversations(user.id, onTeam));
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
        const conversation = await createConversation(user.id, user.username, body);
        return json(conversation, 201);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 400);
      }
    }
    if (path.match(/^\/api\/conversations\/[^/]+$/) && req.method === "PATCH") {
      const id = path.split("/").pop()!;
      const body = await parseBody<Partial<Pick<Conversation, "notes" | "visibility" | "occurredAt">>>(req);
      try {
        return json(await updateConversation(user.id, id, body));
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 403);
      }
    }
    if (path.match(/^\/api\/conversations\/[^/]+$/) && req.method === "DELETE") {
      const id = path.split("/").pop()!;
      try {
        await removeConversation(user.id, id);
        return json({ ok: true });
      } catch (e) {
        return err(e instanceof Error ? e.message : "Error", 403);
      }
    }

    if (path === "/api/follow-ups" && req.method === "GET") {
      return json(await listFollowUps(user.id, true));
    }
    if (path.match(/^\/api\/follow-ups\/[^/]+$/) && req.method === "PATCH") {
      const id = path.split("/").pop()!;
      const body = await parseBody<Partial<FollowUp>>(req);
      const all = await listFollowUps(user.id, false);
      const fu = all.find((f) => f.id === id);
      if (!fu) return err("Not found", 404);
      return json(await saveFollowUp({ ...fu, ...body }));
    }

    if (path === "/api/advisor/suggestions" && req.method === "GET") {
      return json(await getSuggestions(user.id));
    }
    if (path === "/api/advisor/refresh" && req.method === "POST") {
      return json(await refreshAdvisor(user.id));
    }
    if (path.match(/^\/api\/advisor\/[^/]+\/dismiss$/) && req.method === "POST") {
      await dismissAdvisor(user.id, path.split("/")[3]);
      return json({ ok: true });
    }
    if (path === "/api/advisor/goals" && req.method === "GET") {
      const synced = await syncGoalsFromNetwork(user.id);
      return json({
        goals: synced.activeGoals,
        allGoals: synced.allGoals,
        addedFromNetwork: synced.addedGoals,
      });
    }
    if (path === "/api/advisor/goals" && req.method === "PATCH") {
      const body = await parseBody<{ goals: string[] }>(req);
      await setGoals(user.id, body.goals);
      await refreshAdvisor(user.id);
      return json({
        goals: body.goals,
        allGoals: await getAllGoalOptions(user.id),
        addedFromNetwork: [],
      });
    }

    if (path === "/api/meta" && req.method === "GET") {
      return json({
        lastCalendarSync: await getUserMeta(user.id, "lastCalendarSync"),
        googleConnected: await isGoogleConnected(user.id),
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
