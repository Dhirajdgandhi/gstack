import { getContact, getMeeting, getMeetingPrep, getRefinedTeamAgenda, saveMeetingPrep } from "../db";
import type { Contact, MeetingPrep } from "../types";

export async function buildMeetingPrep(userId: string, meetingId: string): Promise<MeetingPrep | null> {
  const meeting = await getMeeting(userId, meetingId);
  if (!meeting) return null;

  const contacts = (
    await Promise.all(meeting.contactIds.map((id) => getContact(userId, id)))
  ).filter((c): c is Contact => c !== null);

  const topics: MeetingPrep["topics"] = [];

  const refined = await getRefinedTeamAgenda(meetingId);
  if (refined) {
    for (const section of refined.sections) {
      for (const item of section.items.slice(0, 3)) {
        topics.push({
          topic: item.text,
          why: `${section.title} · ${item.contributors.join(", ")}`,
          ask: `Cover: ${item.text.slice(0, 80)}`,
        });
      }
    }
    if (refined.summary && topics.length === 0) {
      topics.push({
        topic: refined.summary,
        why: "Team agenda (AI refined)",
        ask: "Walk through the agreed team agenda",
      });
    }
  }

  const contactTopics = contacts.flatMap((c) => {
    const loops = c.pendingAgenda ?? [];
    return loops.slice(0, 2).map((topic) => ({
      topic,
      why: `Carried from last conversation with ${c.name}`,
      ask: `Close the loop on: ${topic}`,
    }));
  });

  topics.push(...contactTopics);

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

  await saveMeetingPrep(prep);
  return prep;
}

export async function getOrCreatePrep(userId: string, meetingId: string): Promise<MeetingPrep | null> {
  return (await getMeetingPrep(userId, meetingId)) ?? (await buildMeetingPrep(userId, meetingId));
}
