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

type FieldState = { linkedin?: string; email?: string; title?: string; company?: string };

export default function LinkedInPromptPanel({ suggestions, onResolved }: Props) {
  const [fieldsById, setFieldsById] = useState<Record<string, FieldState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  function setField(id: string, key: keyof FieldState, value: string) {
    setFieldsById((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  async function submit(e: FormEvent, s: LinkSuggestion) {
    e.preventDefault();
    const fields = fieldsById[s.id] ?? {};
    const hasAny = Object.values(fields).some((v) => v?.trim());
    if (!hasAny) {
      setError(`Add at least one detail for ${s.personName}, or open their contact to edit later.`);
      return;
    }
    setSavingId(s.id);
    setError(null);
    try {
      await api.meetings.linkContact(s.meetingId, {
        personName: s.personName,
        contactId: s.contactId,
        linkedin: fields.linkedin?.trim() || undefined,
        email: fields.email?.trim() || undefined,
        title: fields.title?.trim() || undefined,
        company: fields.company?.trim() || undefined,
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
      <strong>Complete network profiles</strong>
      <p className="hint" style={{ margin: "0.5rem 0 1rem" }}>
        Calendar sync auto-added everyone you meet. Fill in what you know — LinkedIn, email, title — or edit later.
      </p>
      {error && <p className="error">{error}</p>}
      {suggestions.map((s) => (
        <form key={s.id} className="linkedin-prompt-row" onSubmit={(e) => submit(e, s)}>
          <div>
            <strong>{s.personName}</strong>
            {s.contactId && (
              <Link to={`/network/${s.contactId}`} style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                Edit contact →
              </Link>
            )}
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              <Link to={`/meetings/${s.meetingId}`}>{s.meetingTitle}</Link> · {formatWhen(s.meetingStart)}
            </div>
            {s.missingFields && s.missingFields.length > 0 && (
              <div className="tag-picker" style={{ marginTop: "0.35rem" }}>
                {s.missingFields.map((f) => (
                  <span key={f} className="tag-chip" style={{ cursor: "default", opacity: 0.85 }}>
                    missing {f}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="profile-completion-fields">
            <input
              type="url"
              placeholder="LinkedIn URL"
              value={fieldsById[s.id]?.linkedin ?? ""}
              onChange={(e) => setField(s.id, "linkedin", e.target.value)}
            />
            <input
              type="email"
              placeholder="Email"
              value={fieldsById[s.id]?.email ?? ""}
              onChange={(e) => setField(s.id, "email", e.target.value)}
            />
            <input
              placeholder="Title"
              value={fieldsById[s.id]?.title ?? ""}
              onChange={(e) => setField(s.id, "title", e.target.value)}
            />
            <input
              placeholder="Company"
              value={fieldsById[s.id]?.company ?? ""}
              onChange={(e) => setField(s.id, "company", e.target.value)}
            />
            <button className="btn" type="submit" disabled={savingId === s.id}>
              {savingId === s.id ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      ))}
    </div>
  );
}
