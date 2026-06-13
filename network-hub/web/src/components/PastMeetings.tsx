import { Link } from "react-router-dom";
import type { Meeting } from "../types";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Props {
  meetings: Meeting[];
}

export default function PastMeetings({ meetings }: Props) {
  if (meetings.length === 0) {
    return <p className="empty">No past meetings yet. Sync your calendar and they&apos;ll appear here after they end.</p>;
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
          {m.debriefComplete ? (
            <span className="badge ready">Notes saved</span>
          ) : (
            <Link to={`/meetings/${m.id}`} className="badge warn">
              Add notes →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
