import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { TeamAgendaBundle, TeamAgendaItem } from "../types";

const TAG_OPTIONS = ["fundraising", "hiring", "GTM", "learning", "product", "design"];

function displayTags(tags: string[]): string[] {
  return tags.filter((t) => !t.startsWith("by:"));
}

function contributorTag(tags: string[]): string | null {
  const by = tags.find((t) => t.startsWith("by:"));
  return by ? by.replace(/^by:/, "") : null;
}

interface Props {
  meetingId: string;
}

export default function TeamAgendaPanel({ meetingId }: Props) {
  const { user } = useAuth();
  const [bundle, setBundle] = useState<TeamAgendaBundle | null>(null);
  const [text, setText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return api.meetings.teamAgenda.get(meetingId).then(setBundle);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [meetingId]);

  useEffect(() => {
    if (text.trim().length < 3) {
      setSuggestedTags([]);
      return;
    }
    const t = setTimeout(() => {
      api.meetings.teamAgenda
        .suggestTags(meetingId, text)
        .then((r) => setSuggestedTags(r.tags.filter((tag) => !tag.startsWith("by:"))))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [text, meetingId]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const tags = [...new Set([...selectedTags, ...suggestedTags])];
      const next = await api.meetings.teamAgenda.add(meetingId, { text: text.trim(), tags });
      setBundle(next);
      setText("");
      setSelectedTags([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setLoading(false);
    }
  }

  async function refine() {
    setRefining(true);
    setError(null);
    try {
      setBundle(await api.meetings.teamAgenda.refine(meetingId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine failed");
    } finally {
      setRefining(false);
    }
  }

  async function removeItem(item: TeamAgendaItem) {
    if (item.addedByUserId !== user?.id) return;
    setBundle(await api.meetings.teamAgenda.remove(meetingId, item.id));
  }

  const allTagOptions = [...new Set([...TAG_OPTIONS, ...suggestedTags])];

  return (
    <div className="card team-agenda">
      <div className="review-header">
        <strong>Team agenda</strong>
        <span className="hint" style={{ margin: 0 }}>
          Everyone on the team can add items · AI merges into one plan
        </span>
      </div>

      <form onSubmit={submit} style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="agenda-item">Your agenda item</label>
          <textarea
            id="agenda-item"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What should we cover in this meeting?"
            rows={2}
          />
        </div>
        <div className="field">
          <label>Tags</label>
          <div className="tag-picker">
            {allTagOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-chip${selectedTags.includes(tag) || suggestedTags.includes(tag) ? " active" : ""}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          {suggestedTags.length > 0 && (
            <p className="hint" style={{ marginTop: "0.35rem" }}>
              Suggested from your text: {suggestedTags.join(", ")}
            </p>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={loading || !text.trim()}>
          {loading ? "Adding…" : "Add to team agenda"}
        </button>
      </form>

      {bundle && bundle.items.length > 0 && (
        <>
          <h4 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Contributions ({bundle.items.length})</h4>
          <ul className="agenda-contributions">
            {bundle.items.map((item) => (
              <li key={item.id}>
                <div className="agenda-item-row">
                  <div>
                    <span className="badge">{contributorTag(item.tags) ?? item.addedByUsername}</span>
                    {displayTags(item.tags).map((t) => (
                      <span key={t} className="badge secondary" style={{ marginLeft: "0.35rem" }}>
                        {t}
                      </span>
                    ))}
                    <p style={{ margin: "0.35rem 0 0" }}>{item.text}</p>
                  </div>
                  {item.addedByUserId === user?.id && (
                    <button type="button" className="btn secondary" onClick={() => removeItem(item)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="review-header" style={{ marginTop: "1.25rem" }}>
            <strong>AI-refined agenda</strong>
            <button className="btn secondary" type="button" onClick={refine} disabled={refining}>
              {refining ? "Refining…" : "Re-refine"}
            </button>
          </div>

          {bundle.refined ? (
            <div className="refined-agenda">
              <p className="hint">{bundle.refined.summary}</p>
              {!bundle.refined.aiPowered && (
                <p className="hint">Set OPENAI_API_KEY for smarter merging — using grouped fallback.</p>
              )}
              {bundle.refined.sections.map((section) => (
                <div key={section.title} style={{ marginTop: "1rem" }}>
                  <strong>{section.title}</strong>
                  <ul style={{ paddingLeft: "1.25rem", margin: "0.35rem 0 0" }}>
                    {section.items.map((item, i) => (
                      <li key={`${section.title}-${i}`} style={{ marginBottom: "0.5rem" }}>
                        {item.text}
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {" "}
                          — {item.contributors.join(", ")}
                          {item.tags.length > 0 && ` · ${item.tags.join(", ")}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Add items above — AI refinement runs automatically.</p>
          )}
        </>
      )}
    </div>
  );
}
