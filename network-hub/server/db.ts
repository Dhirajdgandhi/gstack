import postgres from "postgres";
import { config } from "./config";
import type {
  AdvisorSuggestion,
  Contact,
  Conversation,
  Debrief,
  FollowUp,
  GoogleTokens,
  Meeting,
  MeetingPrep,
  RefinedTeamAgenda,
  TeamAgendaItem,
  User,
} from "./types";

let sql: postgres.Sql | null = null;
let ready: Promise<void> | null = null;

export async function ensureDb(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    sql = postgres(config.databaseUrl, { max: 10 });
    await migrate(sql);
  })();
  return ready;
}

/** Close the pool — use in one-shot scripts (db-init) so the process can exit. */
export async function closeDb(): Promise<void> {
  if (!sql) return;
  const pool = sql;
  sql = null;
  ready = null;
  await pool.end({ timeout: 5 });
}

function db(): postgres.Sql {
  if (!sql) throw new Error("Database not initialized — call ensureDb() first");
  return sql;
}

async function ensureUserColumns(database: postgres.Sql): Promise<void> {
  await database`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`;
  await database`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await database`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TEXT`;
  await database`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`;
  await database`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`;
  await database`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`;
}

/** Old unrelated `users` tables (integer id + `name`) block Network Hub — rename, don't drop. */
async function replaceLegacyUsersTable(database: postgres.Sql): Promise<void> {
  const cols = await database<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
  `;
  if (cols.length === 0) return;
  const names = new Set(cols.map((c) => c.column_name));
  if (names.has("username")) return;

  const legacyName = "legacy_users_pre_network_hub";
  const existing = await database<{ regclass: string | null }[]>`
    SELECT to_regclass(${`public.${legacyName}`}) AS regclass
  `;
  const suffix = existing[0]?.regclass ? `_${Date.now()}` : "";
  await database.unsafe(`ALTER TABLE users RENAME TO ${legacyName}${suffix}`);
}

async function migrate(database: postgres.Sql): Promise<void> {
  await replaceLegacyUsersTable(database);
  await database`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      email TEXT,
      google_id TEXT,
      display_name TEXT
    )
  `;
  await ensureUserColumns(database);
  await database`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`;
  await database`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`;

  await database`
    CREATE TABLE IF NOT EXISTS google_tokens (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `;
  await database`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;
  await database`CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id)`;

  await database`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;
  await database`CREATE INDEX IF NOT EXISTS idx_meetings_owner ON meetings(owner_id)`;

  await database`
    CREATE TABLE IF NOT EXISTS debriefs (
      meeting_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;
  await database`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;
  await database`
    CREATE TABLE IF NOT EXISTS meeting_prep (
      meeting_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;
  await database`
    CREATE TABLE IF NOT EXISTS advisor (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;
  await database`
    CREATE TABLE IF NOT EXISTS user_meta (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `;
  await database`
    CREATE TABLE IF NOT EXISTS team_agenda_items (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;
  await database`CREATE INDEX IF NOT EXISTS idx_team_agenda_meeting ON team_agenda_items(meeting_id)`;
  await database`
    CREATE TABLE IF NOT EXISTS team_agenda_refined (
      meeting_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `;
  await database`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `;
  await database`CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations ((data::json->>'contactId'))`;
}

function row<T>(data: string): T {
  return JSON.parse(data) as T;
}

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  email?: string | null;
  google_id?: string | null;
  display_name?: string | null;
};

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    email: r.email ?? undefined,
    googleId: r.google_id ?? undefined,
    displayName: r.display_name ?? undefined,
    createdAt: r.created_at,
  };
}

export async function createUser(username: string, passwordHash: string): Promise<User> {
  await ensureDb();
  const user: User = {
    id: crypto.randomUUID(),
    username: username.trim().toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  await db()`
    INSERT INTO users (id, username, password_hash, created_at)
    VALUES (${user.id}, ${user.username}, ${user.passwordHash}, ${user.createdAt})
  `;
  return user;
}

export async function saveUser(user: User): Promise<User> {
  await ensureDb();
  await db()`
    INSERT INTO users (id, username, password_hash, created_at, email, google_id, display_name)
    VALUES (
      ${user.id}, ${user.username}, ${user.passwordHash}, ${user.createdAt},
      ${user.email ?? null}, ${user.googleId ?? null}, ${user.displayName ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      password_hash = EXCLUDED.password_hash,
      created_at = EXCLUDED.created_at,
      email = EXCLUDED.email,
      google_id = EXCLUDED.google_id,
      display_name = EXCLUDED.display_name
  `;
  return user;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  await ensureDb();
  const rows = await db()`
    SELECT id, username, password_hash, created_at, email, google_id, display_name
    FROM users WHERE username = ${username.trim().toLowerCase()}
  `;
  const r = rows[0] as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureDb();
  const rows = await db()`
    SELECT id, username, password_hash, created_at, email, google_id, display_name
    FROM users WHERE email = ${email.trim().toLowerCase()}
  `;
  const r = rows[0] as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  await ensureDb();
  const rows = await db()`
    SELECT id, username, password_hash, created_at, email, google_id, display_name
    FROM users WHERE google_id = ${googleId}
  `;
  const r = rows[0] as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureDb();
  const rows = await db()`
    SELECT id, username, password_hash, created_at, email, google_id, display_name
    FROM users WHERE id = ${id}
  `;
  const r = rows[0] as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export async function saveGoogleTokens(tokens: GoogleTokens): Promise<void> {
  await ensureDb();
  await db()`
    INSERT INTO google_tokens (user_id, data) VALUES (${tokens.userId}, ${JSON.stringify(tokens)})
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data
  `;
}

export async function getGoogleTokens(userId: string): Promise<GoogleTokens | null> {
  await ensureDb();
  const rows = await db()`SELECT data FROM google_tokens WHERE user_id = ${userId}`;
  const r = rows[0] as { data: string } | undefined;
  return r ? row<GoogleTokens>(r.data) : null;
}

export async function deleteGoogleTokens(userId: string): Promise<void> {
  await ensureDb();
  await db()`DELETE FROM google_tokens WHERE user_id = ${userId}`;
}

export async function setUserMeta(userId: string, key: string, value: string): Promise<void> {
  await ensureDb();
  await db()`
    INSERT INTO user_meta (user_id, key, value) VALUES (${userId}, ${key}, ${value})
    ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function getUserMeta(userId: string, key: string): Promise<string | null> {
  await ensureDb();
  const rows = await db()`SELECT value FROM user_meta WHERE user_id = ${userId} AND key = ${key}`;
  const r = rows[0] as { value: string } | undefined;
  return r?.value ?? null;
}

export async function getGoals(userId: string): Promise<string[]> {
  const raw = await getUserMeta(userId, "goals");
  return raw ? (JSON.parse(raw) as string[]) : ["fundraising", "hiring", "learning"];
}

export async function setGoals(userId: string, goals: string[]): Promise<void> {
  await setUserMeta(userId, "goals", JSON.stringify(goals));
}

export async function listContacts(userId: string, q?: string, tag?: string): Promise<Contact[]> {
  await ensureDb();
  const rows = await db()`SELECT data FROM contacts WHERE owner_id = ${userId}`;
  return rows
    .map((r) => row<Contact>((r as { data: string }).data))
    .filter((c) => {
      if (c.ownerId !== userId) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.company ?? ""} ${c.title ?? ""} ${c.profileSummary ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .sort((a, b) => (b.lastTouchedAt ?? b.createdAt).localeCompare(a.lastTouchedAt ?? a.createdAt));
}

export async function getContact(userId: string, id: string): Promise<Contact | null> {
  await ensureDb();
  const rows = await db()`SELECT data FROM contacts WHERE id = ${id} AND owner_id = ${userId}`;
  const r = rows[0] as { data: string } | undefined;
  if (!r) return null;
  const c = row<Contact>(r.data);
  return c.ownerId === userId ? c : null;
}

export async function saveContact(contact: Contact): Promise<Contact> {
  await ensureDb();
  await db()`
    INSERT INTO contacts (id, owner_id, data) VALUES (${contact.id}, ${contact.ownerId}, ${JSON.stringify(contact)})
    ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
  `;
  return contact;
}

export async function deleteContact(userId: string, id: string): Promise<void> {
  await ensureDb();
  await db()`DELETE FROM contacts WHERE id = ${id} AND owner_id = ${userId}`;
}

export async function listMeetings(userId: string, upcomingOnly = true): Promise<Meeting[]> {
  await ensureDb();
  const now = new Date().toISOString();
  const rows = await db()`SELECT data FROM meetings WHERE owner_id = ${userId}`;
  return rows
    .map((r) => row<Meeting>((r as { data: string }).data))
    .filter((m) => m.ownerId === userId && m.status !== "cancelled")
    .filter((m) => (upcomingOnly ? m.end >= now : true))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function listPastMeetings(userId: string, limit = 50): Promise<Meeting[]> {
  await ensureDb();
  const now = new Date().toISOString();
  const rows = await db()`SELECT data FROM meetings WHERE owner_id = ${userId}`;
  return rows
    .map((r) => row<Meeting>((r as { data: string }).data))
    .filter((m) => m.ownerId === userId && m.status !== "cancelled" && m.end < now)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, limit);
}

export async function getMeeting(userId: string, id: string): Promise<Meeting | null> {
  await ensureDb();
  const rows = await db()`SELECT data FROM meetings WHERE id = ${id} AND owner_id = ${userId}`;
  const r = rows[0] as { data: string } | undefined;
  if (!r) return null;
  const m = row<Meeting>(r.data);
  return m.ownerId === userId ? m : null;
}

export async function getMeetingShared(meetingId: string): Promise<Meeting | null> {
  await ensureDb();
  const rows = await db()`SELECT data FROM meetings WHERE id = ${meetingId} LIMIT 1`;
  const r = rows[0] as { data: string } | undefined;
  return r ? row<Meeting>(r.data) : null;
}

export async function upsertMeetings(userId: string, meetings: Meeting[]): Promise<number> {
  await ensureDb();
  for (const m of meetings) {
    await db()`
      INSERT INTO meetings (id, owner_id, data) VALUES (${m.id}, ${userId}, ${JSON.stringify(m)})
      ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
    `;
  }
  await setUserMeta(userId, "lastCalendarSync", new Date().toISOString());
  return meetings.length;
}

export async function clearGoogleSyncedMeetings(userId: string): Promise<void> {
  await ensureDb();
  await db()`DELETE FROM meetings WHERE owner_id = ${userId} AND id LIKE 'gcal-%'`;
}

export async function saveMeeting(meeting: Meeting): Promise<Meeting> {
  await ensureDb();
  await db()`
    INSERT INTO meetings (id, owner_id, data) VALUES (${meeting.id}, ${meeting.ownerId}, ${JSON.stringify(meeting)})
    ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
  `;
  return meeting;
}

async function deleteFollowUpsForMeeting(userId: string, meetingId: string): Promise<void> {
  for (const f of (await listFollowUps(userId, false)).filter((fu) => fu.meetingId === meetingId)) {
    await db()`DELETE FROM follow_ups WHERE id = ${f.id} AND owner_id = ${userId}`;
  }
}

export async function saveDebrief(
  debrief: Debrief,
  meeting: Meeting,
  contacts: Contact[],
  opts?: { replaceFollowUps?: boolean },
): Promise<void> {
  await ensureDb();
  const now = new Date().toISOString();
  const stored: Debrief = { ...debrief, updatedAt: now };
  await db()`
    INSERT INTO debriefs (meeting_id, owner_id, data) VALUES (${stored.meetingId}, ${stored.ownerId}, ${JSON.stringify(stored)})
    ON CONFLICT (meeting_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
  `;

  const touched = now;
  for (const c of contacts) {
    c.lastTouchedAt = touched;
    c.pendingAgenda = debrief.agendaForNext;
    await saveContact(c);
  }

  meeting.debriefComplete = true;
  await db()`
    INSERT INTO meetings (id, owner_id, data) VALUES (${meeting.id}, ${meeting.ownerId}, ${JSON.stringify(meeting)})
    ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
  `;

  if (opts?.replaceFollowUps) await deleteFollowUpsForMeeting(debrief.ownerId, meeting.id);

  for (const fu of debrief.followUps) {
    const followUp: FollowUp = {
      id: crypto.randomUUID(),
      ownerId: debrief.ownerId,
      contactId: contacts[0]?.id,
      meetingId: meeting.id,
      text: fu.text,
      dueDate: fu.dueDate,
      done: fu.done ?? false,
      createdAt: touched,
    };
    await db()`
      INSERT INTO follow_ups (id, owner_id, data) VALUES (${followUp.id}, ${followUp.ownerId}, ${JSON.stringify(followUp)})
      ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
    `;
  }
}

export async function getDebrief(userId: string, meetingId: string): Promise<Debrief | null> {
  await ensureDb();
  const rows = await db()`SELECT data FROM debriefs WHERE meeting_id = ${meetingId} AND owner_id = ${userId}`;
  const r = rows[0] as { data: string } | undefined;
  return r ? row<Debrief>(r.data) : null;
}

export async function listFollowUps(userId: string, openOnly = true): Promise<FollowUp[]> {
  await ensureDb();
  const rows = await db()`SELECT data FROM follow_ups WHERE owner_id = ${userId}`;
  return rows
    .map((r) => row<FollowUp>((r as { data: string }).data))
    .filter((f) => f.ownerId === userId && (openOnly ? !f.done : true))
    .sort((a, b) => (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt));
}

export async function saveFollowUp(followUp: FollowUp): Promise<FollowUp> {
  await ensureDb();
  await db()`
    INSERT INTO follow_ups (id, owner_id, data) VALUES (${followUp.id}, ${followUp.ownerId}, ${JSON.stringify(followUp)})
    ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
  `;
  return followUp;
}

export async function saveMeetingPrep(prep: MeetingPrep): Promise<MeetingPrep> {
  await ensureDb();
  await db()`
    INSERT INTO meeting_prep (meeting_id, owner_id, data) VALUES (${prep.meetingId}, ${prep.ownerId}, ${JSON.stringify(prep)})
    ON CONFLICT (meeting_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
  `;
  return prep;
}

export async function getMeetingPrep(userId: string, meetingId: string): Promise<MeetingPrep | null> {
  await ensureDb();
  const rows = await db()`
    SELECT data FROM meeting_prep WHERE meeting_id = ${meetingId} AND owner_id = ${userId}
  `;
  const r = rows[0] as { data: string } | undefined;
  return r ? row<MeetingPrep>(r.data) : null;
}

export async function listAdvisorSuggestions(userId: string): Promise<AdvisorSuggestion[]> {
  await ensureDb();
  const rows = await db()`SELECT data FROM advisor WHERE owner_id = ${userId}`;
  return rows
    .map((r) => row<AdvisorSuggestion>((r as { data: string }).data))
    .filter((s) => s.ownerId === userId && (!s.dismissedUntil || s.dismissedUntil < new Date().toISOString()))
    .sort((a, b) => b.priority - a.priority);
}

export async function saveAdvisorSuggestions(userId: string, suggestions: AdvisorSuggestion[]): Promise<void> {
  await ensureDb();
  await db()`DELETE FROM advisor WHERE owner_id = ${userId}`;
  for (const s of suggestions) {
    await db()`INSERT INTO advisor (id, owner_id, data) VALUES (${s.id}, ${userId}, ${JSON.stringify(s)})`;
  }
}

export async function dismissAdvisor(userId: string, id: string, days = 30): Promise<void> {
  await ensureDb();
  const rows = await db()`SELECT data FROM advisor WHERE id = ${id} AND owner_id = ${userId}`;
  const r = rows[0] as { data: string } | undefined;
  if (!r) return;
  const s = row<AdvisorSuggestion>(r.data);
  const until = new Date();
  until.setDate(until.getDate() + days);
  s.dismissedUntil = until.toISOString();
  await db()`
    INSERT INTO advisor (id, owner_id, data) VALUES (${id}, ${userId}, ${JSON.stringify(s)})
    ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data
  `;
}

export async function listTeamAgendaItems(meetingId: string): Promise<TeamAgendaItem[]> {
  await ensureDb();
  const rows = await db()`
    SELECT data FROM team_agenda_items WHERE meeting_id = ${meetingId}
    ORDER BY (data::json->>'createdAt')
  `;
  return rows
    .map((r) => row<TeamAgendaItem>((r as { data: string }).data))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveTeamAgendaItem(item: TeamAgendaItem): Promise<TeamAgendaItem> {
  await ensureDb();
  await db()`
    INSERT INTO team_agenda_items (id, meeting_id, data) VALUES (${item.id}, ${item.meetingId}, ${JSON.stringify(item)})
    ON CONFLICT (id) DO UPDATE SET meeting_id = EXCLUDED.meeting_id, data = EXCLUDED.data
  `;
  return item;
}

export async function deleteTeamAgendaItem(meetingId: string, itemId: string): Promise<boolean> {
  await ensureDb();
  const result = await db()`DELETE FROM team_agenda_items WHERE id = ${itemId} AND meeting_id = ${meetingId}`;
  return result.count > 0;
}

export async function countTeamAgendaItems(meetingId: string): Promise<number> {
  await ensureDb();
  const rows = await db()`SELECT COUNT(*)::int AS c FROM team_agenda_items WHERE meeting_id = ${meetingId}`;
  return (rows[0] as { c: number }).c;
}

export async function getRefinedTeamAgenda(meetingId: string): Promise<RefinedTeamAgenda | null> {
  await ensureDb();
  const rows = await db()`SELECT data FROM team_agenda_refined WHERE meeting_id = ${meetingId}`;
  const r = rows[0] as { data: string } | undefined;
  return r ? row<RefinedTeamAgenda>(r.data) : null;
}

export async function saveRefinedTeamAgenda(refined: RefinedTeamAgenda): Promise<RefinedTeamAgenda> {
  await ensureDb();
  await db()`
    INSERT INTO team_agenda_refined (meeting_id, data) VALUES (${refined.meetingId}, ${JSON.stringify(refined)})
    ON CONFLICT (meeting_id) DO UPDATE SET data = EXCLUDED.data
  `;
  return refined;
}

export async function deleteRefinedTeamAgenda(meetingId: string): Promise<void> {
  await ensureDb();
  await db()`DELETE FROM team_agenda_refined WHERE meeting_id = ${meetingId}`;
}

export async function saveConversation(conversation: Conversation): Promise<Conversation> {
  await ensureDb();
  await db()`
    INSERT INTO conversations (id, data) VALUES (${conversation.id}, ${JSON.stringify(conversation)})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
  `;
  return conversation;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  await ensureDb();
  const rows = await db()`SELECT data FROM conversations WHERE id = ${id}`;
  const r = rows[0] as { data: string } | undefined;
  return r ? row<Conversation>(r.data) : null;
}

export async function deleteConversation(id: string): Promise<void> {
  await ensureDb();
  await db()`DELETE FROM conversations WHERE id = ${id}`;
}

export async function listConversationsForContact(
  userId: string,
  contactId: string,
  canSeeTeam: boolean,
): Promise<Conversation[]> {
  await ensureDb();
  const rows = await db()`SELECT data FROM conversations`;
  return rows
    .map((r) => row<Conversation>((r as { data: string }).data))
    .filter(
      (c) =>
        c.contactId === contactId &&
        (c.visibility === "private"
          ? c.addedByUserId === userId
          : canSeeTeam && c.visibility === "team"),
    )
    .sort((a, b) => (b.occurredAt ?? b.createdAt).localeCompare(a.occurredAt ?? a.createdAt));
}

export async function listConversationsForUser(userId: string, canSeeTeam: boolean): Promise<Conversation[]> {
  await ensureDb();
  const rows = await db()`SELECT data FROM conversations`;
  return rows
    .map((r) => row<Conversation>((r as { data: string }).data))
    .filter((c) =>
      c.visibility === "private"
        ? c.addedByUserId === userId
        : canSeeTeam && c.visibility === "team",
    )
    .sort((a, b) => (b.occurredAt ?? b.createdAt).localeCompare(a.occurredAt ?? a.createdAt));
}
