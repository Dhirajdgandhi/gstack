import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { LinkSuggestion } from "../types";

interface Props {
  suggestions: LinkSuggestion[];
  onResolved: () => void;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LinkedInPromptPanel({ suggestions, onResolved }: Props) {
  const [linkedinById, setLinkedinById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  async function submit(e: FormEvent, s: LinkSuggestion) {
    e.preventDefault();
    const linkedin = linkedinById[s.id]?.trim();
    if (!linkedin) {
      setError(`Paste ${s.personName}'s LinkedIn URL`);
      return;
    }
    setSavingId(s.id);
    setError(null);
    try {
      await api.meetings.linkContact(s.meetingId, {
        personName: s.personName,
        linkedin,
        contactId: s.contactId,
      });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="card banner-warn linkedin-prompts">
      <strong>Add LinkedIn for upcoming meetings</strong>
      <p className="hint" style={{ margin: "0.5rem 0 1rem" }}>
        We spotted people on your calendar who aren&apos;t in your network yet (or are missing LinkedIn). Add their profile so prep and debrief stay useful.
      </p>
      {error && <p className="error">{error}</p>}
      {suggestions.map((s) => (
        <form key={s.id} className="linkedin-prompt-row" onSubmit={(e) => submit(e, s)}>
          <div>
            <strong>{s.personName}</strong>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              <Link to={`/meetings/${s.meetingId}`}>{s.meetingTitle}</Link> · {formatWhen(s.meetingStart)}
            </div>
            <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              {s.reason === "no_contact" ? "Not in your network yet" : "Missing LinkedIn URL"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="url"
              placeholder="https://linkedin.com/in/…"
              value={linkedinById[s.id] ?? ""}
              onChange={(e) => setLinkedinById((prev) => ({ ...prev, [s.id]: e.target.value }))}
              style={{ minWidth: "14rem", flex: 1 }}
            />
            <button className="btn" type="submit" disabled={savingId === s.id}>
              {savingId === s.id ? "Saving…" : s.reason === "no_contact" ? "Add to network" : "Save LinkedIn"}
            </button>
          </div>
        </form>
      ))}
    </div>
  );
}
