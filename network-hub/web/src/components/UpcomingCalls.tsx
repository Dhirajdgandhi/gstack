import { Link } from "react-router-dom";
import type { Meeting } from "../types";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function prepBadge(m: Meeting) {
  if (m.debriefComplete) return <span className="badge ready">Debriefed</span>;
  if (m.prepStatus === "ready") return <span className="badge ready">Prep ready</span>;
  if ((m.teamAgendaCount ?? 0) > 0) {
    return <span className="badge ready">{m.teamAgendaCount} agenda</span>;
  }
  if (m.contactIds.length === 0) return <span className="badge warn">Link contacts</span>;
  return <span className="badge">Needs prep</span>;
}

interface Props {
  meetings: Meeting[];
}

export default function UpcomingCalls({ meetings }: Props) {
  if (meetings.length === 0) {
    return <p className="empty">No upcoming calls. Sync your Axon calendar to pull events.</p>;
  }

  return (
    <div className="card">
      {meetings.map((m) => (
        <div key={m.id} className="list-row">
          <div>
            <Link to={`/meetings/${m.id}`}>
              <strong>{m.title}</strong>
            </Link>
            <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{formatWhen(m.start)}</div>
          </div>
          {prepBadge(m)}
        </div>
      ))}
    </div>
  );
}
