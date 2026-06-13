import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { config } from "./config";
import type {
  AdvisorSuggestion,
  Contact,
  Debrief,
  FollowUp,
  GoogleTokens,
  Meeting,
  MeetingPrep,
  RefinedTeamAgenda,
  TeamAgendaItem,
  User,
  Conversation,
} from "./types";

const DB_PATH = () => `${config.dataDir}/data.db`;

let db: Database;

export function getDb(): Database {
  if (!db) {
    mkdirSync(config.dataDir, { recursive: true });
    db = new Database(DB_PATH());
    migrate(db);
  }
  return db;
}

function migrate(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
  `);
  const row = database.query("SELECT version FROM schema_version").get() as { version: number } | null;
  const current = row?.version ?? 0;
  if (current < 2) {
    database.exec(`
      DROP TABLE IF EXISTS contacts;
      DROP TABLE IF EXISTS meetings;
      DROP TABLE IF EXISTS debriefs;
      DROP TABLE IF EXISTS follow_ups;
      DROP TABLE IF EXISTS meeting_prep;
      DROP TABLE IF EXISTS advisor;
      DROP TABLE IF EXISTS meta;
    `);
    database.exec(`INSERT OR REPLACE INTO schema_version (version) VALUES (2)`);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS google_tokens (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meetings_owner ON meetings(owner_id);
    CREATE TABLE IF NOT EXISTS debriefs (
      meeting_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS follow_ups (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meeting_prep (
      meeting_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS advisor (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_meta (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `);

  if (current < 3) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS team_agenda_items (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_team_agenda_meeting ON team_agenda_items(meeting_id);
      CREATE TABLE IF NOT EXISTS team_agenda_refined (
        meeting_id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
    database.exec(`INSERT OR REPLACE INTO schema_version (version) VALUES (3)`);
  }

  if (current < 4) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(json_extract(data, '$.contactId'));
    `);
    database.exec(`INSERT OR REPLACE INTO schema_version (version) VALUES (4)`);
  }

  if (current < 5) {
    const cols = database.query("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const has = (name: string) => cols.some((c) => c.name === name);
    if (!has("email")) database.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    if (!has("google_id")) database.exec(`ALTER TABLE users ADD COLUMN google_id TEXT`);
    if (!has("display_name")) database.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`);
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`);
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);
    database.exec(`INSERT OR REPLACE INTO schema_version (version) VALUES (5)`);
  }
}

function row<T>(data: string): T {
  return JSON.parse(data) as T;
}

// ─── Users ───────────────────────────────────────────────────

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

const USER_SELECT =
  "SELECT id, username, password_hash, created_at, email, google_id, display_name FROM users";

export function createUser(username: string, passwordHash: string): User {
  const user: User = {
    id: crypto.randomUUID(),
    username: username.trim().toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .query("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(user.id, user.username, user.passwordHash, user.createdAt);
  return user;
}

export function saveUser(user: User): User {
  getDb()
    .query(
      `INSERT OR REPLACE INTO users (id, username, password_hash, created_at, email, google_id, display_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      user.id,
      user.username,
      user.passwordHash,
      user.createdAt,
      user.email ?? null,
      user.googleId ?? null,
      user.displayName ?? null,
    );
  return user;
}

export function getUserByUsername(username: string): User | null {
  const r = getDb().query(`${USER_SELECT} WHERE username = ?`).get(username.trim().toLowerCase()) as UserRow | null;
  return r ? rowToUser(r) : null;
}

export function getUserByEmail(email: string): User | null {
  const r = getDb().query(`${USER_SELECT} WHERE email = ?`).get(email.trim().toLowerCase()) as UserRow | null;
  return r ? rowToUser(r) : null;
}

export function getUserByGoogleId(googleId: string): User | null {
  const r = getDb().query(`${USER_SELECT} WHERE google_id = ?`).get(googleId) as UserRow | null;
  return r ? rowToUser(r) : null;
}

export function getUserById(id: string): User | null {
  const r = getDb().query(`${USER_SELECT} WHERE id = ?`).get(id) as UserRow | null;
  return r ? rowToUser(r) : null;
}

// ─── Google OAuth tokens ─────────────────────────────────────

export function saveGoogleTokens(tokens: GoogleTokens): void {
  getDb().query("INSERT OR REPLACE INTO google_tokens (user_id, data) VALUES (?, ?)").run(
    tokens.userId,
    JSON.stringify(tokens),
  );
}

export function getGoogleTokens(userId: string): GoogleTokens | null {
  const r = getDb().query("SELECT data FROM google_tokens WHERE user_id = ?").get(userId) as { data: string } | null;
  return r ? row<GoogleTokens>(r.data) : null;
}

export function deleteGoogleTokens(userId: string): void {
  getDb().query("DELETE FROM google_tokens WHERE user_id = ?").run(userId);
}

// ─── User meta (goals, last sync) ────────────────────────────

export function setUserMeta(userId: string, key: string, value: string): void {
  getDb().query("INSERT OR REPLACE INTO user_meta (user_id, key, value) VALUES (?, ?, ?)").run(userId, key, value);
}

export function getUserMeta(userId: string, key: string): string | null {
  const r = getDb()
    .query("SELECT value FROM user_meta WHERE user_id = ? AND key = ?")
    .get(userId, key) as { value: string } | null;
  return r?.value ?? null;
}

export function getGoals(userId: string): string[] {
  const raw = getUserMeta(userId, "goals");
  return raw ? (JSON.parse(raw) as string[]) : ["fundraising", "hiring", "learning"];
}

export function setGoals(userId: string, goals: string[]): void {
  setUserMeta(userId, "goals", JSON.stringify(goals));
}

// ─── Contacts (private per user) ─────────────────────────────

export function listContacts(userId: string, q?: string, tag?: string): Contact[] {
  return getDb()
    .query("SELECT data FROM contacts WHERE owner_id = ?")
    .all(userId)
    .map((r) => row<Contact>(r.data as string))
    .filter((c) => {
      if (c.ownerId !== userId) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (!q) return true;
      const hay = `${c.name} ${c.company ?? ""} ${c.title ?? ""} ${c.profileSummary ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .sort((a, b) => (b.lastTouchedAt ?? b.createdAt).localeCompare(a.lastTouchedAt ?? a.createdAt));
}

export function getContact(userId: string, id: string): Contact | null {
  const r = getDb().query("SELECT data FROM contacts WHERE id = ? AND owner_id = ?").get(id, userId) as {
    data: string;
  } | null;
  if (!r) return null;
  const c = row<Contact>(r.data);
  return c.ownerId === userId ? c : null;
}

export function saveContact(contact: Contact): Contact {
  getDb()
    .query("INSERT OR REPLACE INTO contacts (id, owner_id, data) VALUES (?, ?, ?)")
    .run(contact.id, contact.ownerId, JSON.stringify(contact));
  return contact;
}

export function deleteContact(userId: string, id: string): void {
  getDb().query("DELETE FROM contacts WHERE id = ? AND owner_id = ?").run(id, userId);
}

// ─── Meetings ────────────────────────────────────────────────

export function listMeetings(userId: string, upcomingOnly = true): Meeting[] {
  const now = new Date().toISOString();
  return getDb()
    .query("SELECT data FROM meetings WHERE owner_id = ?")
    .all(userId)
    .map((r) => row<Meeting>(r.data as string))
    .filter((m) => m.ownerId === userId && m.status !== "cancelled")
    .filter((m) => (upcomingOnly ? m.end >= now : true))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function listPastMeetings(userId: string, limit = 50): Meeting[] {
  const now = new Date().toISOString();
  return getDb()
    .query("SELECT data FROM meetings WHERE owner_id = ?")
    .all(userId)
    .map((r) => row<Meeting>(r.data as string))
    .filter((m) => m.ownerId === userId && m.status !== "cancelled" && m.end < now)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, limit);
}

export function getMeeting(userId: string, id: string): Meeting | null {
  const r = getDb().query("SELECT data FROM meetings WHERE id = ? AND owner_id = ?").get(id, userId) as {
    data: string;
  } | null;
  if (!r) return null;
  const m = row<Meeting>(r.data);
  return m.ownerId === userId ? m : null;
}

/** Any team member's synced row for a shared calendar meeting (same gcal id). */
export function getMeetingShared(meetingId: string): Meeting | null {
  const r = getDb().query("SELECT data FROM meetings WHERE id = ? LIMIT 1").get(meetingId) as {
    data: string;
  } | null;
  return r ? row<Meeting>(r.data) : null;
}

export function upsertMeetings(userId: string, meetings: Meeting[]): number {
  const stmt = getDb().query("INSERT OR REPLACE INTO meetings (id, owner_id, data) VALUES (?, ?, ?)");
  for (const m of meetings) stmt.run(m.id, userId, JSON.stringify(m));
  setUserMeta(userId, "lastCalendarSync", new Date().toISOString());
  return meetings.length;
}

/** Remove prior Google sync rows so switching calendars does not leave stale events. */
export function clearGoogleSyncedMeetings(userId: string): void {
  getDb().query("DELETE FROM meetings WHERE owner_id = ? AND id LIKE 'gcal-%'").run(userId);
}

export function saveMeeting(meeting: Meeting): Meeting {
  getDb()
    .query("INSERT OR REPLACE INTO meetings (id, owner_id, data) VALUES (?, ?, ?)")
    .run(meeting.id, meeting.ownerId, JSON.stringify(meeting));
  return meeting;
}

// ─── Debriefs ────────────────────────────────────────────────

function deleteFollowUpsForMeeting(userId: string, meetingId: string): void {
  for (const f of listFollowUps(userId, false).filter((fu) => fu.meetingId === meetingId)) {
    getDb().query("DELETE FROM follow_ups WHERE id = ? AND owner_id = ?").run(f.id, userId);
  }
}

export function saveDebrief(
  debrief: Debrief,
  meeting: Meeting,
  contacts: Contact[],
  opts?: { replaceFollowUps?: boolean },
): void {
  const now = new Date().toISOString();
  const stored: Debrief = { ...debrief, updatedAt: now };
  getDb()
    .query("INSERT OR REPLACE INTO debriefs (meeting_id, owner_id, data) VALUES (?, ?, ?)")
    .run(stored.meetingId, stored.ownerId, JSON.stringify(stored));

  const touched = now;
  for (const c of contacts) {
    c.lastTouchedAt = touched;
    c.pendingAgenda = debrief.agendaForNext;
    saveContact(c);
  }

  meeting.debriefComplete = true;
  getDb()
    .query("INSERT OR REPLACE INTO meetings (id, owner_id, data) VALUES (?, ?, ?)")
    .run(meeting.id, meeting.ownerId, JSON.stringify(meeting));

  if (opts?.replaceFollowUps) deleteFollowUpsForMeeting(debrief.ownerId, meeting.id);

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
    getDb()
      .query("INSERT OR REPLACE INTO follow_ups (id, owner_id, data) VALUES (?, ?, ?)")
      .run(followUp.id, followUp.ownerId, JSON.stringify(followUp));
  }
}

export function getDebrief(userId: string, meetingId: string): Debrief | null {
  const r = getDb()
    .query("SELECT data FROM debriefs WHERE meeting_id = ? AND owner_id = ?")
    .get(meetingId, userId) as { data: string } | null;
  return r ? row<Debrief>(r.data) : null;
}

// ─── Follow-ups ──────────────────────────────────────────────

export function listFollowUps(userId: string, openOnly = true): FollowUp[] {
  return getDb()
    .query("SELECT data FROM follow_ups WHERE owner_id = ?")
    .all(userId)
    .map((r) => row<FollowUp>(r.data as string))
    .filter((f) => f.ownerId === userId && (openOnly ? !f.done : true))
    .sort((a, b) => (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt));
}

export function saveFollowUp(followUp: FollowUp): FollowUp {
  getDb()
    .query("INSERT OR REPLACE INTO follow_ups (id, owner_id, data) VALUES (?, ?, ?)")
    .run(followUp.id, followUp.ownerId, JSON.stringify(followUp));
  return followUp;
}

// ─── Meeting prep ────────────────────────────────────────────

export function saveMeetingPrep(prep: MeetingPrep): MeetingPrep {
  getDb()
    .query("INSERT OR REPLACE INTO meeting_prep (meeting_id, owner_id, data) VALUES (?, ?, ?)")
    .run(prep.meetingId, prep.ownerId, JSON.stringify(prep));
  return prep;
}

export function getMeetingPrep(userId: string, meetingId: string): MeetingPrep | null {
  const r = getDb()
    .query("SELECT data FROM meeting_prep WHERE meeting_id = ? AND owner_id = ?")
    .get(meetingId, userId) as { data: string } | null;
  return r ? row<MeetingPrep>(r.data) : null;
}

// ─── Advisor ─────────────────────────────────────────────────

export function listAdvisorSuggestions(userId: string): AdvisorSuggestion[] {
  return getDb()
    .query("SELECT data FROM advisor WHERE owner_id = ?")
    .all(userId)
    .map((r) => row<AdvisorSuggestion>(r.data as string))
    .filter((s) => s.ownerId === userId && (!s.dismissedUntil || s.dismissedUntil < new Date().toISOString()))
    .sort((a, b) => b.priority - a.priority);
}

export function saveAdvisorSuggestions(userId: string, suggestions: AdvisorSuggestion[]): void {
  getDb().query("DELETE FROM advisor WHERE owner_id = ?").run(userId);
  const stmt = getDb().query("INSERT INTO advisor (id, owner_id, data) VALUES (?, ?, ?)");
  for (const s of suggestions) stmt.run(s.id, userId, JSON.stringify(s));
}

export function dismissAdvisor(userId: string, id: string, days = 30): void {
  const r = getDb().query("SELECT data FROM advisor WHERE id = ? AND owner_id = ?").get(id, userId) as {
    data: string;
  } | null;
  if (!r) return;
  const s = row<AdvisorSuggestion>(r.data);
  const until = new Date();
  until.setDate(until.getDate() + days);
  s.dismissedUntil = until.toISOString();
  getDb().query("INSERT OR REPLACE INTO advisor (id, owner_id, data) VALUES (?, ?, ?)").run(id, userId, JSON.stringify(s));
}

// ─── Team agenda (shared by meeting id) ───────────────────────

export function listTeamAgendaItems(meetingId: string): TeamAgendaItem[] {
  return getDb()
    .query("SELECT data FROM team_agenda_items WHERE meeting_id = ? ORDER BY json_extract(data, '$.createdAt')")
    .all(meetingId)
    .map((r) => row<TeamAgendaItem>(r.data as string))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function saveTeamAgendaItem(item: TeamAgendaItem): TeamAgendaItem {
  getDb()
    .query("INSERT OR REPLACE INTO team_agenda_items (id, meeting_id, data) VALUES (?, ?, ?)")
    .run(item.id, item.meetingId, JSON.stringify(item));
  return item;
}

export function deleteTeamAgendaItem(meetingId: string, itemId: string): boolean {
  const r = getDb().query("DELETE FROM team_agenda_items WHERE id = ? AND meeting_id = ?").run(itemId, meetingId);
  return r.changes > 0;
}

export function countTeamAgendaItems(meetingId: string): number {
  const r = getDb()
    .query("SELECT COUNT(*) as c FROM team_agenda_items WHERE meeting_id = ?")
    .get(meetingId) as { c: number };
  return r.c;
}

export function getRefinedTeamAgenda(meetingId: string): RefinedTeamAgenda | null {
  const r = getDb().query("SELECT data FROM team_agenda_refined WHERE meeting_id = ?").get(meetingId) as {
    data: string;
  } | null;
  return r ? row<RefinedTeamAgenda>(r.data) : null;
}

export function saveRefinedTeamAgenda(refined: RefinedTeamAgenda): RefinedTeamAgenda {
  getDb()
    .query("INSERT OR REPLACE INTO team_agenda_refined (meeting_id, data) VALUES (?, ?)")
    .run(refined.meetingId, JSON.stringify(refined));
  return refined;
}

export function deleteRefinedTeamAgenda(meetingId: string): void {
  getDb().query("DELETE FROM team_agenda_refined WHERE meeting_id = ?").run(meetingId);
}

// ─── Conversations (team + private) ───────────────────────────

export function saveConversation(conversation: Conversation): Conversation {
  getDb()
    .query("INSERT OR REPLACE INTO conversations (id, data) VALUES (?, ?)")
    .run(conversation.id, JSON.stringify(conversation));
  return conversation;
}

export function getConversation(id: string): Conversation | null {
  const r = getDb().query("SELECT data FROM conversations WHERE id = ?").get(id) as { data: string } | null;
  return r ? row<Conversation>(r.data) : null;
}

export function deleteConversation(id: string): void {
  getDb().query("DELETE FROM conversations WHERE id = ?").run(id);
}

/** Team-visible + caller's private conversations for a contact. */
export function listConversationsForContact(
  userId: string,
  contactId: string,
  canSeeTeam: boolean,
): Conversation[] {
  return getDb()
    .query("SELECT data FROM conversations")
    .all()
    .map((r) => row<Conversation>(r.data as string))
    .filter(
      (c) =>
        c.contactId === contactId &&
        (c.visibility === "private"
          ? c.addedByUserId === userId
          : canSeeTeam && c.visibility === "team"),
    )
    .sort((a, b) => (b.occurredAt ?? b.createdAt).localeCompare(a.occurredAt ?? a.createdAt));
}

export function listConversationsForUser(userId: string, canSeeTeam: boolean): Conversation[] {
  return getDb()
    .query("SELECT data FROM conversations")
    .all()
    .map((r) => row<Conversation>(r.data as string))
    .filter((c) =>
      c.visibility === "private"
        ? c.addedByUserId === userId
        : canSeeTeam && c.visibility === "team",
    )
    .sort((a, b) => (b.occurredAt ?? b.createdAt).localeCompare(a.occurredAt ?? a.createdAt));
}
