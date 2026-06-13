import { getContact, listContacts, listMeetings, saveMeeting } from "../db";
import { createContact, updateContact } from "./contacts";
import { collectMeetingPersonNames, namesMatch } from "../lib/meeting-names";
import { missingProfileFields } from "./network-sync";
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

export function computeLinkSuggestions(userId: string, upcomingOnly = true): LinkSuggestion[] {
  const contacts = listContacts(userId);
  const meetings = listMeetings(userId, upcomingOnly);
  const suggestions: LinkSuggestion[] = [];
  const seen = new Set<string>();

  for (const meeting of meetings) {
    const personNames = meeting.attendeeNames?.length
      ? meeting.attendeeNames
      : collectMeetingPersonNames(meeting.title, []);

    for (const personName of personNames) {
      const key = `${meeting.id}:${personName.toLowerCase()}`;
      if (seen.has(key)) continue;

      const contact = findContactByName(contacts, personName);
      const missing = contact ? missingProfileFields(contact) : ["linkedin", "email", "title", "company"];

      if (missing.length === 0) continue;

      seen.add(key);
      const reason: LinkSuggestion["reason"] = !contact?.linkedin?.trim()
        ? "missing_linkedin"
        : "incomplete_profile";

      suggestions.push({
        id: `${meeting.id}:${personName.toLowerCase().replace(/\s+/g, "-")}`,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        meetingStart: meeting.start,
        personName,
        contactId: contact?.id,
        contactName: contact?.name,
        reason,
        missingFields: missing,
      });
    }
  }

  return suggestions.sort((a, b) => a.meetingStart.localeCompare(b.meetingStart));
}

export function linkPersonToMeeting(
  userId: string,
  username: string,
  meeting: Meeting,
  input: { personName: string; linkedin?: string; email?: string; contactId?: string; title?: string; company?: string },
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
    contact = createContact(userId, username, {
      name: input.personName,
      linkedin: input.linkedin,
      email: input.email,
      title: input.title,
      company: input.company,
      knownVia: `Calendar: ${meeting.title}`,
      tags: ["from-calendar"],
      enrichedFrom: "calendar",
      autoCreated: false,
    });
    created = true;
  } else {
    const patch: Partial<Contact> = {};
    if (input.linkedin) patch.linkedin = input.linkedin;
    if (input.email) patch.email = input.email;
    if (input.title) patch.title = input.title;
    if (input.company) patch.company = input.company;
    if (contact.autoCreated && (input.linkedin || input.email || input.title)) {
      patch.autoCreated = false;
    }
    if (Object.keys(patch).length > 0) {
      contact = updateContact(userId, contact.id, patch);
    }
  }

  const contactIds = [...new Set([...meeting.contactIds, contact.id])];
  const updated: Meeting = { ...meeting, contactIds };
  saveMeeting(updated);

  return { meeting: updated, contact, created };
}
