import {
  deleteConversation,
  getContact,
  getConversation,
  listConversationsForContact,
  listConversationsForUser,
  saveConversation,
} from "../db";
import type { Conversation } from "../types";

export async function createConversation(
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
): Promise<Conversation> {
  if (!input.notes?.trim()) throw new Error("Notes required");
  if (!input.contactId && !input.personName?.trim()) {
    throw new Error("contactId or personName required");
  }
  if (input.contactId && !(await getContact(userId, input.contactId))) {
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

export async function updateConversation(
  userId: string,
  id: string,
  patch: Partial<Pick<Conversation, "notes" | "visibility" | "occurredAt">>,
): Promise<Conversation> {
  const existing = await getConversation(id);
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

export async function removeConversation(userId: string, id: string): Promise<void> {
  const existing = await getConversation(id);
  if (!existing) throw new Error("Conversation not found");
  if (existing.addedByUserId !== userId) throw new Error("Only the author can delete this conversation");
  await deleteConversation(id);
}

export async function getContactConversations(
  userId: string,
  contactId: string,
  canSeeTeam: boolean,
): Promise<Conversation[]> {
  if (!(await getContact(userId, contactId))) throw new Error("Contact not found");
  return listConversationsForContact(userId, contactId, canSeeTeam);
}

export async function getVisibleConversations(userId: string, canSeeTeam: boolean): Promise<Conversation[]> {
  return listConversationsForUser(userId, canSeeTeam);
}
