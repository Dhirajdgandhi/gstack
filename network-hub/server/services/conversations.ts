import {
  deleteConversation,
  getConversation,
  listConversationsForContact,
  listConversationsForUser,
  saveConversation,
} from "../db";
import { getContact } from "../db";
import type { Conversation } from "../types";

export function createConversation(
  userId: string,
  username: string,
  input: {
    contactId?: string;
    personName?: string;
    meetingId?: string;
    notes: string;
    visibility?: Conversation["visibility"];
    occurredAt?: string;
  },
): Conversation {
  if (!input.notes?.trim()) throw new Error("Notes required");
  if (!input.contactId && !input.personName?.trim()) {
    throw new Error("contactId or personName required");
  }
  if (input.contactId && !getContact(userId, input.contactId)) {
    throw new Error("Contact not found");
  }

  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    addedByUserId: userId,
    addedByUsername: username,
    contactId: input.contactId,
    personName: input.personName?.trim(),
    meetingId: input.meetingId,
    notes: input.notes.trim(),
    visibility: input.visibility ?? "team",
    occurredAt: input.occurredAt,
    createdAt: now,
    updatedAt: now,
  };
  return saveConversation(conversation);
}

export function updateConversation(
  userId: string,
  id: string,
  patch: Partial<Pick<Conversation, "notes" | "visibility" | "occurredAt">>,
): Conversation {
  const existing = getConversation(id);
  if (!existing) throw new Error("Conversation not found");
  if (existing.addedByUserId !== userId) throw new Error("Only the author can edit this conversation");

  const updated: Conversation = {
    ...existing,
    ...patch,
    notes: patch.notes?.trim() ?? existing.notes,
    updatedAt: new Date().toISOString(),
  };
  return saveConversation(updated);
}

export function removeConversation(userId: string, id: string): void {
  const existing = getConversation(id);
  if (!existing) throw new Error("Conversation not found");
  if (existing.addedByUserId !== userId) throw new Error("Only the author can delete this conversation");
  deleteConversation(id);
}

export function getContactConversations(userId: string, contactId: string, canSeeTeam: boolean): Conversation[] {
  if (!getContact(userId, contactId)) throw new Error("Contact not found");
  return listConversationsForContact(userId, contactId, canSeeTeam);
}

export function getVisibleConversations(userId: string, canSeeTeam: boolean): Conversation[] {
  return listConversationsForUser(userId, canSeeTeam);
}
