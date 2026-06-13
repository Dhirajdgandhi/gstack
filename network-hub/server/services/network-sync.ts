import { listContacts, listMeetings, saveMeeting } from "../db";
import { collectMeetingPersonNames, namesMatch } from "../lib/meeting-names";
import { createContact, updateContact } from "./contacts";
import type { Contact, Meeting } from "../types";

export interface NetworkSyncResult {
  contactsCreated: number;
  meetingsLinked: number;
}

const SKIP_EMAIL = /^(no-?reply|mailer-daemon|calendar-notification|resource\.calendar)/i;

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._+-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function findContactByName(contacts: Contact[], personName: string): Contact | undefined {
  return contacts.find((c) => namesMatch(c.name, personName));
}

function findContactByEmail(contacts: Contact[], email: string): Contact | undefined {
  const lower = email.toLowerCase();
  return contacts.find((c) => c.email?.toLowerCase() === lower);
}

function ensureContact(
  userId: string,
  username: string,
  contacts: Contact[],
  input: { name: string; email?: string; knownVia: string },
): { contact: Contact; created: boolean; contacts: Contact[] } {
  let contact =
    (input.email ? findContactByEmail(contacts, input.email) : undefined) ??
    findContactByName(contacts, input.name);

  if (contact) {
    const patch: Partial<Contact> = {};
    if (input.email && !contact.email) patch.email = input.email;
    if (!contact.knownVia) patch.knownVia = input.knownVia;
    if (Object.keys(patch).length > 0) {
      contact = updateContact(userId, contact.id, patch);
      contacts = contacts.map((c) => (c.id === contact!.id ? contact! : c));
    }
    return { contact, created: false, contacts };
  }

  contact = createContact(userId, username, {
    name: input.name,
    email: input.email,
    knownVia: input.knownVia,
    tags: ["from-calendar"],
    enrichedFrom: "calendar",
    autoCreated: true,
  });
  return { contact, created: true, contacts: [...contacts, contact] };
}

function linkContactToMeeting(meeting: Meeting, contactId: string): boolean {
  if (meeting.contactIds.includes(contactId)) return false;
  meeting.contactIds = [...meeting.contactIds, contactId];
  return true;
}

/** Auto-add meeting people to network and link every meeting ↔ contact. */
export function ensureNetworkFromMeetings(
  userId: string,
  username: string,
  meetings: Meeting[],
): NetworkSyncResult {
  let contactsCreated = 0;
  let meetingsLinked = 0;
  let contacts = listContacts(userId);

  for (const meeting of meetings) {
    const personNames = meeting.attendeeNames?.length
      ? meeting.attendeeNames
      : collectMeetingPersonNames(meeting.title, []);
    const knownVia = `Calendar: ${meeting.title}`;

    for (const personName of personNames) {
      const email = meeting.attendeeEmails.find((e) => {
        const stub = nameFromEmail(e);
        return namesMatch(stub, personName);
      });
      const result = ensureContact(userId, username, contacts, {
        name: personName,
        email,
        knownVia,
      });
      contacts = result.contacts;
      if (result.created) contactsCreated++;
      if (linkContactToMeeting(meeting, result.contact.id)) meetingsLinked++;
    }

    for (const email of meeting.attendeeEmails) {
      if (SKIP_EMAIL.test(email)) continue;
      const already = findContactByEmail(contacts, email);
      if (already) {
        if (linkContactToMeeting(meeting, already.id)) meetingsLinked++;
        continue;
      }
      const matchedByName = personNames.some((n) => namesMatch(n, nameFromEmail(email)));
      if (matchedByName) continue;

      const result = ensureContact(userId, username, contacts, {
        name: nameFromEmail(email),
        email,
        knownVia,
      });
      contacts = result.contacts;
      if (result.created) contactsCreated++;
      if (linkContactToMeeting(meeting, result.contact.id)) meetingsLinked++;
    }

    saveMeeting(meeting);
  }

  const backfill = backfillMeetingLinks(userId, contacts);
  return {
    contactsCreated,
    meetingsLinked: meetingsLinked + backfill,
  };
}

/** Link every contact to all meetings where email or name matches. */
export function backfillMeetingLinks(userId: string, contacts = listContacts(userId)): number {
  const allMeetings = listMeetings(userId, false);
  let linked = 0;

  for (const meeting of allMeetings) {
    const personNames = meeting.attendeeNames?.length
      ? meeting.attendeeNames
      : collectMeetingPersonNames(meeting.title, []);
    let changed = false;

    for (const contact of contacts) {
      const emailHit =
        contact.email && meeting.attendeeEmails.some((e) => e.toLowerCase() === contact.email!.toLowerCase());
      const nameHit = personNames.some((n) => namesMatch(contact.name, n));
      if ((emailHit || nameHit) && !meeting.contactIds.includes(contact.id)) {
        meeting.contactIds = [...meeting.contactIds, contact.id];
        changed = true;
        linked++;
      }
    }

    if (changed) saveMeeting(meeting);
  }

  return linked;
}

export function listMeetingsForContact(userId: string, contactId: string): Meeting[] {
  const contact = listContacts(userId).find((c) => c.id === contactId);
  if (!contact) return [];

  return listMeetings(userId, false)
    .filter((m) => m.contactIds.includes(contactId))
    .sort((a, b) => b.start.localeCompare(a.start));
}

export function missingProfileFields(contact: Contact): string[] {
  const missing: string[] = [];
  if (!contact.linkedin?.trim()) missing.push("linkedin");
  if (!contact.email?.trim()) missing.push("email");
  if (!contact.title?.trim()) missing.push("title");
  if (!contact.company?.trim()) missing.push("company");
  return missing;
}
