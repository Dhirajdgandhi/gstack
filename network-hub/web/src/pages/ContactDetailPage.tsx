import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import AgentUpdates from "../components/AgentUpdates";
import FormattedNotesField from "../components/FormattedNotesField";
import MarkdownContent from "../components/MarkdownContent";
import type { AgentResult, Contact } from "../types";

const TAG_SUGGESTIONS = ["investor", "founder", "operator", "mentor", "customer", "recruiter"];

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [agent, setAgent] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [knownVia, setKnownVia] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [summary, setSummary] = useState("");
  const [goalTags, setGoalTags] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    api.contacts
      .get(id)
      .then((c) => {
        setContact(c);
        setName(c.name);
        setTitle(c.title ?? "");
        setCompany(c.company ?? "");
        setEmail(c.email ?? "");
        setPhone(c.phone ?? "");
        setLinkedinUrl(c.linkedin ?? "");
        setKnownVia(c.knownVia ?? "");
        setTags(c.tags);
        setNotes(c.notes ?? "");
        setSummary(c.profileSummary ?? "");
        setGoalTags(c.goalTags);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { contact: saved, agent: result } = await api.contacts.update(id, {
        name,
        title: title || undefined,
        company: company || undefined,
        linkedin: linkedinUrl || undefined,
        email: email || undefined,
        phone: phone || undefined,
        knownVia: knownVia || undefined,
        notes: notes || undefined,
        tags,
        goalTags,
        profileSummary: summary || undefined,
      });
      setContact(saved);
      setTags(saved.tags);
      setGoalTags(saved.goalTags);
      setSummary(saved.profileSummary ?? "");
      setAgent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  if (error && !contact) return <p className="error">{error}</p>;
  if (!contact) return <p className="empty">Loading…</p>;

  return (
    <>
      <Link to="/network">← Back to network</Link>
      <h2 className="page-title" style={{ marginTop: "1rem" }}>
        Edit contact
      </h2>
      <p className="page-sub">
        {contact.name} · added by {contact.addedByUsername}
      </p>

      <form className="card contact-review" onSubmit={handleSave}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="name">Name *</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="company">Company</label>
            <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="linkedin">LinkedIn URL</label>
            <input id="linkedin" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="knownVia">Who do you know them through?</label>
          <input id="knownVia" value={knownVia} onChange={(e) => setKnownVia(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="summary">Profile summary</label>
          {summary.trim() ? (
            <MarkdownContent content={summary} />
          ) : null}
          <textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} style={{ marginTop: summary.trim() ? "0.75rem" : 0 }} />
        </div>

        <div className="field">
          <label>Tags</label>
          <div className="tag-picker">
            {TAG_SUGGESTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tag-chip${tags.includes(t) ? " active" : ""}`}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {goalTags.length > 0 && (
          <div className="field">
            <label>Goal alignment</label>
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {goalTags.map((g) => (
                <span key={g} className="badge">
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        <FormattedNotesField
          id="notes"
          label="Your notes"
          value={notes}
          onChange={setNotes}
          rows={5}
          hint="Supports markdown. Paste from Google Docs to keep formatting."
        />

        {contact.pendingAgenda.length > 0 && (
          <div className="field">
            <label>Pending agenda (from last debrief)</label>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--muted)" }}>
              {contact.pendingAgenda.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="btn-row" style={{ marginTop: "1rem" }}>
          <button className="btn secondary" type="button" onClick={() => navigate("/network")}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <AgentUpdates agent={agent} onDismiss={() => setAgent(null)} />
    </>
  );
}
