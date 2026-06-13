import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import LinkedInPromptPanel from "../components/LinkedInPromptPanel";
import UpcomingCalls from "../components/UpcomingCalls";
import PastMeetings from "../components/PastMeetings";
import { useAuth } from "../context/AuthContext";
import type { ConfigStatus, FollowUp, LinkSuggestion, Meeting } from "../types";

export default function DashboardPage() {
  const { googleConnected } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pastMeetings, setPastMeetings] = useState<Meeting[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, past, f, meta, cfg, links] = await Promise.all([
      api.meetings.upcoming(),
      api.meetings.past(),
      api.followUps.list(),
      api.meta(),
      api.config.status(),
      api.calendar.linkSuggestions(),
    ]);
    setMeetings(m);
    setPastMeetings(past);
    setFollowUps(f);
    setLastSync(meta.lastCalendarSync);
    setConfig(cfg);
    setLinkSuggestions(links.suggestions);
  }, []);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  async function sync() {
    setSyncing(true);
    setSyncNote(null);
    try {
      const r = await api.calendar.sync();
      setSyncNote(
        `Synced ${r.count} events from ${r.calendarLabel ?? config?.googleCalendarLabel ?? "Axon AI"}` +
          (r.linkSuggestions.length ? ` · ${r.linkSuggestions.length} need LinkedIn` : ""),
      );
      setLinkSuggestions(r.linkSuggestions);
      await load();
    } catch (e) {
      setSyncNote(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <h2 className="page-title">Upcoming calls</h2>
      <p className="page-sub">
        From the {config?.googleCalendarLabel ?? "Axon AI"} shared calendar.{" "}
        {lastSync ? `Last sync: ${new Date(lastSync).toLocaleString()}` : "Not synced yet."}
      </p>

      {!googleConnected && (
        <div className="card banner-warn">
          Connect Google Calendar in <Link to="/settings">Settings</Link> to sync Axon AI meetings.
        </div>
      )}

      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button className="btn" onClick={sync} disabled={syncing || !googleConnected}>
          {syncing ? "Syncing…" : `Sync ${config?.googleCalendarLabel ?? "Axon AI"} calendar`}
        </button>
        {syncNote && <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{syncNote}</span>}
      </div>

      <LinkedInPromptPanel suggestions={linkSuggestions} onResolved={load} />

      <UpcomingCalls meetings={meetings} />

      <h3 style={{ marginTop: "2rem" }}>Past meetings</h3>
      <p className="page-sub" style={{ marginTop: 0 }}>
        Add notes, learnings, and next steps after each call.
      </p>
      <PastMeetings meetings={pastMeetings} />

      {followUps.length > 0 && (
        <>
          <h3 style={{ marginTop: "2rem" }}>Open follow-ups</h3>
          <div className="card">
            {followUps.map((f) => (
              <div key={f.id} className="list-row">
                <span>{f.text}</span>
                <button
                  className="btn secondary"
                  onClick={async () => {
                    await api.followUps.patch(f.id, { done: true });
                    load();
                  }}
                >
                  Done
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
