import { getContact, getDebrief, getMeeting, getMeetingPrep, listContacts, saveMeetingPrep } from "../db";
import type { Contact, MeetingPrep } from "../types";

export function buildMeetingPrep(userId: string, meetingId: string): MeetingPrep | null {
  const meeting = getMeeting(userId, meetingId);
  if (!meeting) return null;

  const contacts = meeting.contactIds
    .map((id) => getContact(userId, id))
    .filter((c): c is Contact => c !== null);

  const topics = contacts.flatMap((c) => {
    const loops = c.pendingAgenda ?? [];
    return loops.slice(0, 2).map((topic) => ({
      topic,
      why: `Carried from last conversation with ${c.name}`,
      ask: `Close the loop on: ${topic}`,
    }));
  });

  if (topics.length === 0 && contacts.length > 0) {
    const c = contacts[0];
    const hook = c.profileSummary?.split("\n")[0] ?? c.linkedinProfile?.headline;
    topics.push({
      topic: hook ? `Their focus: ${hook.slice(0, 80)}` : `Priorities at ${c.company ?? "their org"}`,
      why: `${c.name} — ${c.title ?? "contact"}`,
      ask: "What's the one thing you're focused on this quarter?",
    });
  }

  if (topics.length === 0) {
    topics.push({
      topic: meeting.title,
      why: "Link attendees to contacts for richer prep",
      ask: "Identify the main outcome you want from this meeting",
    });
  }

  const openLoops: string[] = [];
  for (const c of contacts) {
    openLoops.push(...(c.pendingAgenda ?? []));
    if (c.profileSummary) {
      openLoops.push(`Context: ${c.profileSummary.slice(0, 120)}…`);
    }
  }

  const prep: MeetingPrep = {
    meetingId,
    ownerId: userId,
    topics: topics.slice(0, 5),
    openLoops: [...new Set(openLoops)].slice(0, 5),
    avoid: ["Generic small talk without a clear ask"],
    generatedAt: new Date().toISOString(),
  };

  saveMeetingPrep(prep);
  return prep;
}

export function getOrCreatePrep(userId: string, meetingId: string): MeetingPrep | null {
  return getMeetingPrep(userId, meetingId) ?? buildMeetingPrep(userId, meetingId);
}
