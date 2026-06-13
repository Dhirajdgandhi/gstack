import { getContact, saveContact } from "../db";
import type { Contact } from "../types";
import { normalizeLinkedInUrl } from "./linkedin-enrich";

export function createContact(
  ownerId: string,
  addedByUsername: string,
  input: {
    name: string;
    title?: string;
    company?: string;
    linkedin?: string;
    email?: string;
    phone?: string;
    knownVia?: string;
    tags?: string[];
    notes?: string;
    goalTags?: string[];
    linkedinProfile?: Contact["linkedinProfile"];
    profileSummary?: string;
    enrichedFrom?: Contact["enrichedFrom"];
    enrichedAt?: string;
    isPrivate?: boolean;
    autoCreated?: boolean;
  },
): Contact {
  const now = new Date().toISOString();
  const contact: Contact = {
    id: crypto.randomUUID(),
    ownerId,
    addedByUsername,
    isPrivate: input.isPrivate !== false,
    name: input.name.trim(),
    title: input.title?.trim(),
    company: input.company?.trim(),
    linkedin: input.linkedin ? normalizeLinkedInUrl(input.linkedin) : undefined,
    email: input.email?.trim().toLowerCase(),
    phone: input.phone?.trim(),
    knownVia: input.knownVia?.trim(),
    tags: input.tags ?? [],
    notes: input.notes?.trim(),
    goalTags: input.goalTags ?? [],
    lastTouchedAt: undefined,
    pendingAgenda: [],
    linkedinProfile: input.linkedinProfile,
    profileSummary: input.profileSummary,
    enrichedFrom: input.enrichedFrom ?? "manual",
    enrichedAt: input.enrichedAt,
    autoCreated: input.autoCreated,
    createdAt: now,
    updatedAt: now,
  };
  if (contact.name.length < 2) throw new Error("Name must be at least 2 characters");
  return saveContact(contact);
}

export function updateContact(ownerId: string, id: string, patch: Partial<Contact>): Contact {
  const existing = getContact(ownerId, id);
  if (!existing) throw new Error("Contact not found");

  const updated: Contact = {
    ...existing,
    ...patch,
    id: existing.id,
    ownerId: existing.ownerId,
    addedByUsername: existing.addedByUsername,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (updated.linkedin) updated.linkedin = normalizeLinkedInUrl(updated.linkedin);
  if (updated.email) updated.email = updated.email.toLowerCase();
  return saveContact(updated);
}

export { normalizeLinkedInUrl };
