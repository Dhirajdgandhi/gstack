import type { AgentResult } from "../types";

interface Props {
  agent: AgentResult | null;
  onDismiss?: () => void;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function AgentUpdates({ agent, onDismiss }: Props) {
  if (!agent) return null;

  return (
    <div className="card agent-panel">
      <div className="agent-panel-header">
        <strong>{agent.aiPowered ? "Agent updates" : "Suggestions"}</strong>
        {onDismiss && (
          <button className="btn secondary" type="button" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        {agent.message}
      </p>
      {agent.applied.length > 0 ? (
        <ul className="agent-updates-list">
          {agent.applied.map((u) => (
            <li key={u.field}>
              <strong>{u.label}</strong>
              <span>{formatValue(u.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nothing else to fill in right now.</p>
      )}
    </div>
  );
}
