import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import AgentUpdates from "../components/AgentUpdates";
import FormattedNotesField from "../components/FormattedNotesField";
import MarkdownContent from "../components/MarkdownContent";
import TeamAgendaPanel from "../components/TeamAgendaPanel";
import type { AgentResult, Contact, Debrief, LinkSuggestion, Meeting, MeetingPrep } from "../types";

function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function arrayToLines(items: string[]): string {
  return items.join("\n");
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [prep, setPrep] = useState<MeetingPrep | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agent, setAgent] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [learned, setLearned] = useState("");
  const [followUps, setFollowUps] = useState("");
  const [agendaForNext, setAgendaForNext] = useState("");
  const [mood, setMood] = useState<Debrief["mood"]>("ok");
  const [linkPrompt, setLinkPrompt] = useState<LinkSuggestion | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.meetings.get(id),
      api.meetings.prep(id),
      api.meetings.debrief(id),
      api.contacts.list(),
      api.calendar.linkSuggestions(),
    ])
      .then(([m, p, d, c, links]) => {
        setMeeting(m);
        setPrep(p);
        setDebrief(d);
        setContacts(c);
        const hit = links.suggestions.find((s) => s.meetingId === id);
        setLinkPrompt(hit ?? null);
        if (d) {
          setNotes(d.notes ?? "");
          setSummary(d.summary ?? "");
          setLearned(arrayToLines(d.learned));
          setFollowUps(arrayToLines(d.followUps.map((f) => f.text)));
          setAgendaForNext(arrayToLines(d.agendaForNext));
          setMood(d.mood ?? "ok");
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const linked = contacts.filter((c) => meeting?.contactIds.includes(c.id));
  const ended = meeting ? new Date(meeting.end) < new Date() : false;
  const showDebriefForm = ended && (!debrief || editing);

  async function saveLinkedIn(e: FormEvent) {
    e.preventDefault();
    if (!id || !linkPrompt || !linkedinUrl.trim()) return;
    setLinkSaving(true);
    try {
      await api.meetings.linkContact(id, {
        personName: linkPrompt.personName,
        linkedin: linkedinUrl.trim(),
        contactId: linkPrompt.contactId,
      });
      const [m, c, links] = await Promise.all([
        api.meetings.get(id),
        api.contacts.list(),
        api.calendar.linkSuggestions(),
      ]);
      setMeeting(m);
      setContacts(c);
      setLinkPrompt(links.suggestions.find((s) => s.meetingId === id) ?? null);
      setLinkedinUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save LinkedIn");
    } finally {
      setLinkSaving(false);
    }
  }

  async function submitDebrief(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const { debrief: saved, agent: result } = await api.meetings.saveDebrief(id, {
        notes: notes || undefined,
        summary: summary || undefined,
        learned: linesToArray(learned),
        agendaForNext: linesToArray(agendaForNext),
        followUps: linesToArray(followUps).map((text) => ({ text, done: false })),
        mood,
      });
      setDebrief(saved);
      setNotes(saved.notes ?? "");
      setSummary(saved.summary ?? "");
      setLearned(arrayToLines(saved.learned));
      setFollowUps(arrayToLines(saved.followUps.map((f) => f.text)));
      setAgendaForNext(arrayToLines(saved.agendaForNext));
      setMood(saved.mood ?? "ok");
      setAgent(result);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (error && !meeting) return <p className="error">{error}</p>;
  if (!meeting) return <p className="empty">Loading…</p>;

  return (
    <>
      <Link to="/">← Back</Link>
      <h2 className="page-title" style={{ marginTop: "1rem" }}>
        {meeting.title}
      </h2>
      <p className="page-sub">
        {new Date(meeting.start).toLocaleString()} — {new Date(meeting.end).toLocaleTimeString()}
        {ended && <span className="badge" style={{ marginLeft: "0.5rem" }}>Past</span>}
      </p>

      {linkPrompt && (
        <form className="card banner-warn" onSubmit={saveLinkedIn}>
          <strong>Complete profile for {linkPrompt.personName}</strong>
          <p className="hint" style={{ margin: "0.5rem 0" }}>
            {linkPrompt.contactId ? (
              <>
                Already in your network — add LinkedIn or{" "}
                <Link to={`/network/${linkPrompt.contactId}`}>edit contact</Link>.
              </>
            ) : (
              <>This meeting includes {linkPrompt.personName}. Add what you know — LinkedIn helps most.</>
            )}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="url"
              placeholder="https://linkedin.com/in/…"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              style={{ flex: 1, minWidth: "12rem" }}
            />
            <button className="btn" type="submit" disabled={linkSaving}>
              {linkSaving ? "Saving…" : "Save to network"}
            </button>
          </div>
        </form>
      )}

      {linked.length > 0 && (
        <div className="card">
          <strong>Attendees</strong>
          {linked.map((c) => (
            <div key={c.id} className="list-row">
              <span>
                <Link to={`/network/${c.id}`}>{c.name}</Link>
                {c.company && ` · ${c.company}`}
              </span>
              {c.linkedin && (
                <a href={c.linkedin} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {!ended && id && <TeamAgendaPanel meetingId={id} />}

      {prep && !ended && (
        <div className="card">
          <strong>Suggested topics</strong>
          <ul style={{ paddingLeft: "1.25rem" }}>
            {prep.topics.map((t) => (
              <li key={t.topic} style={{ marginBottom: "0.75rem" }}>
                <strong>{t.topic}</strong>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t.why}</div>
                <div style={{ fontSize: "0.9rem" }}>Ask: {t.ask}</div>
              </li>
            ))}
          </ul>
          {prep.openLoops.length > 0 && (
            <>
              <strong>Open loops</strong>
              <ul>
                {prep.openLoops.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {debrief && !editing ? (
        <div className="card">
          <div className="review-header">
            <strong>Meeting notes</strong>
            <button className="btn secondary" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
          {debrief.summary && (
            <>
              <strong>Summary</strong>
              <MarkdownContent content={debrief.summary} />
            </>
          )}
          {debrief.notes && (
            <>
              <strong>Raw notes</strong>
              <MarkdownContent content={debrief.notes} className="markdown-body muted" />
            </>
          )}
          {debrief.learned.length > 0 && (
            <>
              <strong>Learnings</strong>
              <ul>
                {debrief.learned.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
          {debrief.followUps.length > 0 && (
            <>
              <strong>Follow-ups</strong>
              <ul>
                {debrief.followUps.map((f) => (
                  <li key={f.text}>{f.text}</li>
                ))}
              </ul>
            </>
          )}
          {debrief.agendaForNext.length > 0 && (
            <>
              <strong>Next steps</strong>
              <ul>
                {debrief.agendaForNext.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : showDebriefForm ? (
        <form className="card" onSubmit={submitDebrief}>
          <h3 style={{ marginTop: 0 }}>{debrief ? "Edit meeting notes" : "Post-call debrief"}</h3>
          <p className="hint">
            Add whatever you have — raw notes, bullets, or half-formed thoughts. After you save, the agent fills in
            missing summaries, learnings, and next steps.
          </p>
          <FormattedNotesField
            id="notes"
            label="Meeting notes"
            value={notes}
            onChange={setNotes}
            placeholder="Paste from Google Docs or type markdown…"
            rows={6}
            hint="Paste from Google Docs — headings, bold, and lists are preserved as markdown."
          />
          <FormattedNotesField
            id="summary"
            label="Summary"
            value={summary}
            onChange={setSummary}
            placeholder="One-paragraph recap (agent can generate if left blank)"
            rows={3}
          />
          <div className="field">
            <label htmlFor="learned">Learnings (one per line)</label>
            <textarea id="learned" value={learned} onChange={(e) => setLearned(e.target.value)} rows={3} />
          </div>
          <div className="field">
            <label htmlFor="followUps">Follow-ups (one per line)</label>
            <textarea id="followUps" value={followUps} onChange={(e) => setFollowUps(e.target.value)} rows={2} />
          </div>
          <div className="field">
            <label htmlFor="agendaForNext">Next steps / agenda for next call (one per line)</label>
            <textarea id="agendaForNext" value={agendaForNext} onChange={(e) => setAgendaForNext(e.target.value)} rows={2} />
          </div>
          <div className="field">
            <label htmlFor="mood">How did it go?</label>
            <select
              id="mood"
              value={mood}
              onChange={(e) => setMood(e.target.value as Debrief["mood"])}
              style={{
                padding: "0.5rem",
                background: "var(--bg)",
                color: "var(--text)",
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <option value="great">Great</option>
              <option value="ok">OK</option>
              <option value="miss">Missed the mark</option>
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="btn-row">
            {editing && (
              <button className="btn secondary" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save & run agent"}
            </button>
          </div>
        </form>
      ) : (
        <p className="card" style={{ color: "var(--muted)" }}>
          Debrief unlocks after the meeting ends.
        </p>
      )}

      <AgentUpdates agent={agent} onDismiss={() => setAgent(null)} />
    </>
  );
}
