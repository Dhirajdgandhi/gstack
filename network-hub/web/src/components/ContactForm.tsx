import { FormEvent, useRef, useState } from "react";
import FormattedNotesField from "./FormattedNotesField";
import { api, type LinkedInEnrichment } from "../api/client";
import AgentUpdates from "./AgentUpdates";
import type { AgentResult, LinkedInProfile } from "../types";

interface Props {
  onSaved: () => void;
  linkedinConfigured: boolean;
  username: string;
}

type Step = "import" | "preview" | "review";

const TAG_SUGGESTIONS = ["investor", "founder", "operator", "mentor", "customer", "recruiter"];

export default function ContactForm({ onSaved, linkedinConfigured, username }: Props) {
  const [step, setStep] = useState<Step>("import");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [enrichedFrom, setEnrichedFrom] = useState<"linkedin_api" | "linkedin_pdf" | "manual">("manual");
  const [isPrivate, setIsPrivate] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [knownVia, setKnownVia] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [profile, setProfile] = useState<LinkedInProfile | undefined>();
  const [summary, setSummary] = useState("");
  const [agent, setAgent] = useState<AgentResult | null>(null);

  function applyEnrichment(data: LinkedInEnrichment, source: "linkedin_api" | "linkedin_pdf") {
    setEnrichedFrom(source);
    setName(data.name ?? "");
    setTitle(data.title ?? "");
    setCompany(data.company ?? "");
    setEmail(data.email ?? "");
    setLinkedinUrl(data.linkedin ?? linkedinUrl);
    setProfile(data.profile);
    setSummary(data.summary ?? "");
    setStep("preview");
  }

  async function fetchFromLinkedIn() {
    if (!linkedinUrl.trim()) {
      setError("Paste a LinkedIn profile URL first");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.contacts.enrichLinkedIn(linkedinUrl.trim());
      applyEnrichment({ ...data, linkedin: data.linkedin }, "linkedin_api");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfSelected(file: File) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.contacts.parseResumePdf(file, linkedinUrl || undefined);
      applyEnrichment(
        {
          name: data.name,
          title: data.title,
          company: data.company,
          email: data.email,
          linkedin: data.linkedin ?? linkedinUrl,
          profile: data.profile,
          summary: data.summary,
        },
        "linkedin_pdf",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF parse failed");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function skipToManual() {
    setEnrichedFrom("manual");
    setStep("review");
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function resetForm() {
    setStep("import");
    setLinkedinUrl("");
    setEnrichedFrom("manual");
    setIsPrivate(true);
    setName("");
    setTitle("");
    setCompany("");
    setEmail("");
    setPhone("");
    setKnownVia("");
    setTags([]);
    setNotes("");
    setProfile(undefined);
    setSummary("");
    setError(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { agent: result } = await api.contacts.create({
        name,
        title: title || undefined,
        company: company || undefined,
        linkedin: linkedinUrl || undefined,
        email: email || undefined,
        phone: phone || undefined,
        knownVia: knownVia || undefined,
        notes: notes || undefined,
        tags,
        linkedinProfile: profile,
        profileSummary: summary || undefined,
        enrichedFrom,
        enrichedAt: enrichedFrom !== "manual" ? new Date().toISOString() : undefined,
        isPrivate,
      });
      resetForm();
      setAgent(result);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  if (step === "import") {
    return (
      <div className="card contact-import">
        <h3 style={{ marginTop: 0 }}>Add to your network</h3>
        <p className="hint">Import from LinkedIn — we extract fields into the right places for meeting prep.</p>

        <div className="field">
          <label htmlFor="linkedin">LinkedIn profile URL (optional for PDF upload)</label>
          <input
            id="linkedin"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/jane-doe"
          />
        </div>

        <p className="hint">
          <strong>Recommended:</strong> LinkedIn profile → <strong>More</strong> → <strong>Save to PDF</strong> → upload below.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="file-input"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePdfSelected(f);
          }}
        />
        {loading && <p className="hint">Parsing PDF…</p>}

        {linkedinConfigured && (
          <>
            <div className="divider">
              <span>or fetch automatically</span>
            </div>
            <button className="btn" type="button" onClick={fetchFromLinkedIn} disabled={loading}>
              {loading ? "Fetching…" : "Fetch from LinkedIn API"}
            </button>
          </>
        )}

        <button className="btn secondary btn-block" type="button" onClick={skipToManual} style={{ marginTop: "1rem" }}>
          Enter manually instead
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="card contact-preview">
        <h3 style={{ marginTop: 0 }}>Review import</h3>
        <p className="hint">We parsed these fields from the PDF. Click continue to edit and save.</p>

        <dl className="preview-grid">
          <dt>Name</dt>
          <dd>{name || "—"}</dd>
          <dt>Title</dt>
          <dd>{title || "—"}</dd>
          <dt>Company</dt>
          <dd>{company || "—"}</dd>
          {profile?.headline && profile.headline !== title && (
            <>
              <dt>Headline</dt>
              <dd>{profile.headline}</dd>
            </>
          )}
          {profile?.location && (
            <>
              <dt>Location</dt>
              <dd>{profile.location}</dd>
            </>
          )}
          {email && (
            <>
              <dt>Email</dt>
              <dd>{email}</dd>
            </>
          )}
          {linkedinUrl && (
            <>
              <dt>LinkedIn</dt>
              <dd>{linkedinUrl}</dd>
            </>
          )}
        </dl>

        {profile?.experience && profile.experience.length > 0 && (
          <div className="preview-section">
            <strong>Experience</strong>
            <ul>
              {profile.experience.slice(0, 4).map((e, i) => (
                <li key={i}>
                  {e.title}
                  {e.company ? ` @ ${e.company}` : ""}
                  {e.duration ? ` · ${e.duration}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary && (
          <div className="profile-summary">
            <strong>Summary</strong>
            <p>{summary.slice(0, 300)}{summary.length > 300 ? "…" : ""}</p>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: "1.25rem" }}>
          <button className="btn secondary" type="button" onClick={() => setStep("import")}>
            ← Upload again
          </button>
          <button className="btn" type="button" onClick={() => setStep("review")}>
            Continue to edit & save →
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <form className="card contact-review" onSubmit={handleSave}>
      <div className="review-header">
        <h3 style={{ margin: 0 }}>Save contact</h3>
        <button className="btn secondary" type="button" onClick={() => setStep(enrichedFrom === "manual" ? "import" : "preview")}>
          ← Back
        </button>
      </div>

      <p className="hint">
        Added by <strong>{username}</strong> · {isPrivate ? "Private to you" : "May be shared later"}
      </p>

      {profile?.profilePictureUrl && (
        <img src={profile.profilePictureUrl} alt="" className="profile-avatar" />
      )}

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
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. VP of Product" />
        </div>
        <div className="field">
          <label htmlFor="company">Company</label>
          <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="linkedin-review">LinkedIn URL</label>
        <input id="linkedin-review" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {profile?.headline && (
        <div className="field">
          <label htmlFor="headline">Headline</label>
          <input id="headline" value={profile.headline} readOnly className="readonly" />
        </div>
      )}

      {summary && (
        <div className="field">
          <label htmlFor="summary">Profile summary</label>
          <textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} />
        </div>
      )}

      <div className="field">
        <label htmlFor="knownVia">Who do you know them through?</label>
        <input
          id="knownVia"
          value={knownVia}
          onChange={(e) => setKnownVia(e.target.value)}
          placeholder="Met at YC batch via Alex"
        />
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

      <FormattedNotesField
        id="notes"
        label="Your notes"
        value={notes}
        onChange={setNotes}
        placeholder="Why this person matters to your goals"
        rows={4}
      />

      <label className="toggle-row">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        <span>
          <strong>Keep private</strong>
          <span className="hint" style={{ display: "block", margin: "0.25rem 0 0" }}>
            Only you can see this contact. Turn off when you&apos;re ready to share with your team (coming soon).
          </span>
        </span>
      </label>

      {error && <p className="error">{error}</p>}
      <button className="btn btn-block" type="submit" disabled={loading} style={{ marginTop: "1rem" }}>
        {loading ? "Saving…" : "Save to my network"}
      </button>
    </form>
    <AgentUpdates agent={agent} onDismiss={() => setAgent(null)} />
    </>
  );
}
