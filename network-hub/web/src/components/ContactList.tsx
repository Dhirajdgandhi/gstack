import { Link } from "react-router-dom";
import type { Contact } from "../types";

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

interface Props {
  contacts: Contact[];
}

export default function ContactList({ contacts }: Props) {
  if (contacts.length === 0) {
    return <p className="empty">No contacts yet. Add your first connection above.</p>;
  }

  return (
    <div className="card">
      {contacts.map((c) => {
        const stale = daysSince(c.lastTouchedAt ?? c.createdAt);
        const isPrivate = c.isPrivate !== false;
        return (
          <div key={c.id} className="list-row">
            <div>
              <Link to={`/network/${c.id}`}>
                <strong>{c.name}</strong>
              </Link>
              {(c.title || c.company) && (
                <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  {[c.title, c.company].filter(Boolean).join(" @ ")}
                </div>
              )}
              {c.linkedinProfile?.headline && c.linkedinProfile.headline !== c.title && (
                <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{c.linkedinProfile.headline}</div>
              )}
              {c.knownVia && (
                <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>via {c.knownVia}</div>
              )}
              <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.35rem" }}>
                Added by {c.addedByUsername ?? "you"}
                {isPrivate && (
                  <span className="badge" style={{ marginLeft: "0.5rem" }}>
                    Private
                  </span>
                )}
                {c.autoCreated && (
                  <span className="badge warn" style={{ marginLeft: "0.5rem" }}>
                    Needs info
                  </span>
                )}
              </div>
              {c.tags.length > 0 && (
                <div style={{ marginTop: "0.35rem" }}>
                  {c.tags.map((t) => (
                    <span key={t} className="badge" style={{ marginRight: "0.35rem" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <Link to={`/network/${c.id}`} className="btn secondary" style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}>
                Edit
              </Link>
              {stale !== null && stale >= 90 && <span className="badge warn" style={{ display: "block", marginTop: "0.35rem" }}>{stale}d stale</span>}
              {c.linkedin && (
                <div style={{ marginTop: "0.35rem" }}>
                  <a href={c.linkedin} target="_blank" rel="noreferrer">
                    LinkedIn
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
