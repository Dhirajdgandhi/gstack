import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import FormattedNotesField from "./FormattedNotesField";
import MarkdownContent from "./MarkdownContent";
import type { Conversation } from "../types";

interface Props {
  contactId: string;
  contactName: string;
}

export default function ConversationsPanel({ contactId, contactName }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [occurredAt, setOccurredAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const list = await api.contacts.conversations.list(contactId);
    setItems(list);
  }

  useEffect(() => {
    load().catch(console.error);
  }, [contactId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!notes.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.contacts.conversations.add(contactId, {
        notes: notes.trim(),
        visibility,
        occurredAt: occurredAt || undefined,
      });
      setNotes("");
      setOccurredAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function toggleVisibility(c: Conversation) {
    if (c.addedByUserId !== user?.id) return;
    const next = c.visibility === "team" ? "private" : "team";
    await api.conversations.update(c.id, { visibility: next });
    await load();
  }

  return (
    <div className="card conversations-panel">
      <h3 style={{ marginTop: 0 }}>Conversations</h3>
      <p className="hint">
        Log offline chats with {contactName}. Team-visible notes help everyone prep; private notes stay with you.
      </p>

      <form onSubmit={handleAdd}>
        <FormattedNotesField
          id="conv-notes"
          label="What happened?"
          value={notes}
          onChange={setNotes}
          rows={4}
          hint="Coffee chat, hallway intro, DM thread — markdown supported."
        />
        <div className="grid-2" style={{ marginTop: "0.75rem" }}>
          <div className="field">
            <label htmlFor="conv-when">When (optional)</label>
            <input
              id="conv-when"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Visibility</label>
            <div className="tag-picker">
              <button
                type="button"
                className={`tag-chip${visibility === "team" ? " active" : ""}`}
                onClick={() => setVisibility("team")}
              >
                Team
              </button>
              <button
                type="button"
                className={`tag-chip${visibility === "private" ? " active" : ""}`}
                onClick={() => setVisibility("private")}
              >
                Private
              </button>
            </div>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={loading || !notes.trim()} style={{ marginTop: "0.75rem" }}>
          {loading ? "Saving…" : "Add conversation"}
        </button>
      </form>

      {items.length > 0 && (
        <div className="conversation-list">
          {items.map((c) => (
            <div key={c.id} className="conversation-item">
              <div className="conversation-meta">
                <span>{c.addedByUsername}</span>
                <span>·</span>
                <span className={`visibility-badge ${c.visibility}`}>{c.visibility}</span>
                <span>·</span>
                <span>{new Date(c.occurredAt ?? c.createdAt).toLocaleString()}</span>
                {c.addedByUserId === user?.id && (
                  <button type="button" className="btn-link" onClick={() => toggleVisibility(c)}>
                    Make {c.visibility === "team" ? "private" : "team"}
                  </button>
                )}
              </div>
              <MarkdownContent content={c.notes} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
