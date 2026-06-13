import { getContact, listContacts, listMeetings, saveMeeting } from "../db";
import { createContact, updateContact } from "./contacts";
import { collectMeetingPersonNames, namesMatch } from "../lib/meeting-names";
import type { Contact, LinkSuggestion, Meeting } from "../types";

function findContactByName(contacts: Contact[], personName: string): Contact | undefined {
  const exact = contacts.find((c) => namesMatch(c.name, personName));
  if (exact) return exact;
  const first = personName.split(" ")[0]?.toLowerCase() ?? "";
  if (first.length < 3) return undefined;
  const partial = contacts.filter((c) => {
    const cn = c.name.toLowerCase();
    return cn.startsWith(first) || cn.split(" ")[0] === first;
  });
  return partial.length === 1 ? partial[0] : undefined;
}

function isLinked(contact: Contact): boolean {
  return Boolean(contact.linkedin?.trim());
}

export function computeLinkSuggestions(userId: string, upcomingOnly = true): LinkSuggestion[] {
  const contacts = listContacts(userId);
  const meetings = listMeetings(userId, upcomingOnly);
  const suggestions: LinkSuggestion[] = [];

  for (const meeting of meetings) {
    const personNames = meeting.attendeeNames?.length
      ? meeting.attendeeNames
      : collectMeetingPersonNames(meeting.title, []);

    for (const personName of personNames) {
      const contact = findContactByName(contacts, personName);
      const linkedContactIds = new Set(meeting.contactIds);

      if (contact && linkedContactIds.has(contact.id) && isLinked(contact)) continue;

      const reason: LinkSuggestion["reason"] = !contact ? "no_contact" : "missing_linkedin";

      suggestions.push({
        id: `${meeting.id}:${personName.toLowerCase().replace(/\s+/g, "-")}`,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        meetingStart: meeting.start,
        personName,
        contactId: contact?.id,
        contactName: contact?.name,
        reason,
      });
    }
  }

  return suggestions.sort((a, b) => a.meetingStart.localeCompare(b.meetingStart));
}

export function linkPersonToMeeting(
  userId: string,
  username: string,
  meeting: Meeting,
  input: { personName: string; linkedin?: string; email?: string; contactId?: string },
): { meeting: Meeting; contact: Contact; created: boolean } {
  let contact: Contact | null = null;
  let created = false;

  if (input.contactId) {
    contact = getContact(userId, input.contactId);
    if (!contact) throw new Error("Contact not found");
  } else {
    contact = findContactByName(listContacts(userId), input.personName) ?? null;
  }

  if (!contact) {
    if (!input.linkedin?.trim()) {
      throw new Error("LinkedIn URL required to add a new contact to your network");
    }
    contact = createContact(userId, username, {
      name: input.personName,
      linkedin: input.linkedin,
      email: input.email,
      knownVia: `Calendar: ${meeting.title}`,
    });
    created = true;
  } else {
    if (input.linkedin || input.email) {
      contact = updateContact(userId, contact.id, {
        linkedin: input.linkedin ?? contact.linkedin,
        email: input.email ?? contact.email,
      });
    } else if (!contact.linkedin?.trim()) {
      throw new Error("LinkedIn URL required — add their profile to your network");
    }
  }

  const contactIds = [...new Set([...meeting.contactIds, contact.id])];
  const updated: Meeting = { ...meeting, contactIds };
  saveMeeting(updated);

  return { meeting: updated, contact, created };
}
