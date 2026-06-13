import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdvisorSuggestion } from "../types";

export default function AdvisorPage() {
  const [suggestions, setSuggestions] = useState<AdvisorSuggestion[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [allGoals, setAllGoals] = useState<string[]>([]);
  const [addedFromNetwork, setAddedFromNetwork] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([api.advisor.suggestions(), api.advisor.goals()]);
    setSuggestions(s);
    setGoals(g.goals);
    setAllGoals(g.allGoals);
    setAddedFromNetwork(g.addedFromNetwork ?? []);
  }, []);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  async function refresh() {
    setLoading(true);
    try {
      setSuggestions(await api.advisor.refresh());
      const g = await api.advisor.goals();
      setGoals(g.goals);
      setAllGoals(g.allGoals);
      setAddedFromNetwork(g.addedFromNetwork ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function toggleGoal(goal: string) {
    const next = goals.includes(goal) ? goals.filter((g) => g !== goal) : [...goals, goal];
    const r = await api.advisor.setGoals(next);
    setGoals(r.goals);
    setAllGoals(r.allGoals);
    setSuggestions(await api.advisor.suggestions());
  }

  return (
    <>
      <h2 className="page-title">Networking advisor</h2>
      <p className="page-sub">
        Who to meet, who to revive, and gaps in your network. Goals auto-update when you tag contacts (e.g. investor → fundraising).
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <strong>Your goals</strong>
        {addedFromNetwork.length > 0 && (
          <p className="hint" style={{ margin: "0.5rem 0 0" }}>
            Added from your network: {addedFromNetwork.join(", ")}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
          {allGoals.map((g) => (
            <button
              key={g}
              type="button"
              className={`btn${goals.includes(g) ? "" : " secondary"}`}
              onClick={() => toggleGoal(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <button className="btn secondary" style={{ marginTop: "1rem" }} onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh suggestions"}
        </button>
      </div>

      {suggestions.length === 0 ? (
        <p className="empty">Add contacts and sync calendar to unlock advisor suggestions.</p>
      ) : (
        suggestions.map((s) => (
          <div key={s.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <span className="badge">{s.type}</span>
                <h3 style={{ margin: "0.5rem 0 0.25rem" }}>{s.title}</h3>
                <p style={{ color: "var(--muted)", margin: 0 }}>{s.rationale}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className="badge">P{s.priority}</span>
                <div style={{ marginTop: "0.5rem" }}>
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      await api.advisor.dismiss(s.id);
                      load();
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
