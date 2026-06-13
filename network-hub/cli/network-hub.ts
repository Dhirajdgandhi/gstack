#!/usr/bin/env bun
/**
 * Network Hub CLI — same capabilities as the web app and Cursor skills.
 *
 * Usage:
 *   network-hub login --username you --password secret
 *   network-hub calendar sync
 *   network-hub calendar link-suggestions
 *   network-hub contacts list [--query ayushi]
 *   network-hub contacts add --name "Ayushi" --linkedin https://linkedin.com/in/...
 *   network-hub meetings upcoming
 *   network-hub meetings link --meeting-id gcal-xxx --name Ayushi --linkedin URL
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API_URL = process.env.NETWORK_HUB_API ?? process.env.API_URL ?? "http://localhost:8787";
const TOKEN_PATH = join(homedir(), ".network-hub", "cli-token");

function loadToken(): string | null {
  try {
    return readFileSync(TOKEN_PATH, "utf-8").trim() || null;
  } catch {
    return process.env.NETWORK_HUB_TOKEN ?? null;
  }
}

function saveToken(token: string): void {
  mkdirSync(join(homedir(), ".network-hub"), { recursive: true });
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = loadToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function cmdLogin(args: string[]) {
  const username = flag(args, "--username") ?? flag(args, "-u");
  const password = flag(args, "--password") ?? flag(args, "-p");
  if (!username || !password) {
    console.error("Usage: network-hub login --username USER --password PASS");
    process.exit(1);
  }
  const { token, user } = await api<{ token: string; user: { username: string } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  saveToken(token);
  console.log(`Logged in as ${user.username}. Token saved to ${TOKEN_PATH}`);
}

async function cmdCalendarSync() {
  const r = await api<{
    count: number;
    calendarLabel: string;
    linkSuggestions: unknown[];
    contactsCreated: number;
    meetingsLinked: number;
  }>("/calendar/sync", {
    method: "POST",
  });
  console.log(`Synced ${r.count} events from ${r.calendarLabel}`);
  if (r.contactsCreated) console.log(`Added ${r.contactsCreated} people to network`);
  if (r.meetingsLinked) console.log(`Linked ${r.meetingsLinked} meeting ↔ contact pairs`);
  if (r.linkSuggestions.length) {
    console.log(`${r.linkSuggestions.length} profile(s) need details — run: network-hub calendar incomplete-profiles`);
  }
}

async function cmdLinkSuggestions() {
  const { suggestions } = await api<{
    suggestions: Array<Record<string, string | string[] | undefined>>;
  }>("/calendar/link-suggestions");
  if (!suggestions.length) {
    console.log("All profiles look complete for upcoming meetings.");
    return;
  }
  for (const s of suggestions) {
    const missing = Array.isArray(s.missingFields) ? s.missingFields.join(", ") : "";
    console.log(`- ${s.personName} · ${s.meetingTitle} · missing: ${missing || s.reason}`);
    if (s.contactId) console.log(`  contact: ${s.contactId}`);
    console.log(`  meeting: ${s.meetingId}`);
  }
}

async function cmdContactsList(args: string[]) {
  const q = flag(args, "--query") ?? flag(args, "-q");
  const path = q ? `/contacts?q=${encodeURIComponent(q)}` : "/contacts";
  const contacts = await api<Array<{ id: string; name: string; linkedin?: string; company?: string }>>(path);
  for (const c of contacts) {
    console.log(`${c.name}${c.company ? ` · ${c.company}` : ""}${c.linkedin ? " · LinkedIn ✓" : " · no LinkedIn"}`);
    console.log(`  id: ${c.id}`);
  }
}

async function cmdContactsAdd(args: string[]) {
  const name = flag(args, "--name") ?? flag(args, "-n");
  const linkedin = flag(args, "--linkedin") ?? flag(args, "-l");
  const email = flag(args, "--email");
  if (!name) {
    console.error("Usage: network-hub contacts add --name NAME [--linkedin URL] [--email EMAIL]");
    process.exit(1);
  }
  const { contact } = await api<{ contact: { id: string; name: string } }>("/contacts", {
    method: "POST",
    body: JSON.stringify({ name, linkedin, email }),
  });
  console.log(`Created contact ${contact.name} (${contact.id})`);
}

async function cmdMeetingsUpcoming() {
  const meetings = await api<Array<{ id: string; title: string; start: string; contactIds: string[] }>>(
    "/meetings/upcoming",
  );
  for (const m of meetings) {
    console.log(`${new Date(m.start).toLocaleString()} · ${m.title}`);
    console.log(`  id: ${m.id} · contacts linked: ${m.contactIds.length}`);
  }
}

async function cmdMeetingsLink(args: string[]) {
  const meetingId = flag(args, "--meeting-id") ?? flag(args, "-m");
  const name = flag(args, "--name") ?? flag(args, "-n");
  const linkedin = flag(args, "--linkedin") ?? flag(args, "-l");
  if (!meetingId || !name || !linkedin) {
    console.error("Usage: network-hub meetings link --meeting-id ID --name NAME --linkedin URL");
    process.exit(1);
  }
  const r = await api<{ contact: { name: string }; created: boolean }>(`/meetings/${meetingId}/link-contact`, {
    method: "POST",
    body: JSON.stringify({ personName: name, linkedin }),
  });
  console.log(`${r.created ? "Created" : "Updated"} ${r.contact.name} and linked to meeting`);
}

async function cmdAdvisorSuggestions() {
  const items = await api<Array<{ title: string; rationale: string; type: string }>>("/advisor/suggestions");
  for (const s of items) {
    console.log(`[${s.type}] ${s.title}`);
    console.log(`  ${s.rationale}`);
  }
}

function help() {
  console.log(`Network Hub CLI (${API_URL})

Auth:
  login --username U --password P     Save JWT to ~/.network-hub/cli-token

Calendar:
  calendar sync                       Sync Axon AI shared calendar (auto-adds network)
  calendar link-suggestions           Profiles missing details for upcoming meetings
  calendar incomplete-profiles        Alias for link-suggestions

Contacts:
  contacts list [--query Q]           List your network
  contacts add --name N [--linkedin URL]

Meetings:
  meetings upcoming                   Upcoming calls
  meetings link -m ID -n NAME -l URL  Add LinkedIn + link to meeting

Advisor:
  advisor suggestions                 Networking recommendations

Env: NETWORK_HUB_API, NETWORK_HUB_TOKEN`);
}

const [, , domain, sub, ...rest] = process.argv;

try {
  if (!domain || domain === "help" || hasFlag(process.argv, "--help")) {
    help();
  } else if (domain === "login") {
    await cmdLogin(process.argv.slice(2));
  } else if (domain === "calendar" && sub === "sync") {
    await cmdCalendarSync();
  } else if (domain === "calendar" && (sub === "link-suggestions" || sub === "incomplete-profiles")) {
    await cmdLinkSuggestions();
  } else if (domain === "contacts" && sub === "list") {
    await cmdContactsList(rest);
  } else if (domain === "contacts" && sub === "add") {
    await cmdContactsAdd(rest);
  } else if (domain === "meetings" && sub === "upcoming") {
    await cmdMeetingsUpcoming();
  } else if (domain === "meetings" && sub === "link") {
    await cmdMeetingsLink(rest);
  } else if (domain === "advisor" && sub === "suggestions") {
    await cmdAdvisorSuggestions();
  } else {
    help();
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
