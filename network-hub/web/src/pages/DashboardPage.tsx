import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import JarvisCommandBar from "../components/JarvisCommandBar";
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
  const [jarvisReply, setJarvisReply] = useState<string | null>(null);

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
      const parts = [
        `Synced ${r.count} events from ${r.calendarLabel ?? config?.googleCalendarLabel ?? "Axon AI"}`,
      ];
      if (r.contactsCreated) parts.push(`${r.contactsCreated} added to network`);
      if (r.meetingsLinked) parts.push(`${r.meetingsLinked} meeting links`);
      if (r.linkSuggestions.length) parts.push(`${r.linkSuggestions.length} profiles to complete`);
      setSyncNote(parts.join(" · "));
      setJarvisReply(`Calendar intelligence updated. ${parts.join(". ")}.`);
      setLinkSuggestions(r.linkSuggestions);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed";
      setSyncNote(message);
      setJarvisReply(`Calendar sync failed: ${message}`);
    } finally {
      setSyncing(false);
    }
  }

  function handleCommand(cmd: string) {
    const lower = cmd.toLowerCase();
    if (lower.includes("sync") || lower.includes("calendar")) {
      setJarvisReply("Initiating calendar sync…");
      sync();
      return;
    }
    if (lower.includes("network") || lower.includes("contact")) {
      setJarvisReply("Routing to Network Graph. Use the sidebar or visit /network.");
      return;
    }
    if (lower.includes("prep") || lower.includes("meeting")) {
      setJarvisReply(`Tracking ${meetings.length} upcoming engagements. Select a meeting to run prep protocols.`);
      return;
    }
    if (lower.includes("help") || lower.includes("status")) {
      setJarvisReply(
        `Systems nominal. ${meetings.length} upcoming calls. ${linkSuggestions.length} profiles need enrichment.` +
          (lastSync ? ` Last sync: ${new Date(lastSync).toLocaleString()}.` : " Calendar not synced yet."),
      );
      return;
    }
    setJarvisReply(`Acknowledged: "${cmd}". I am ready to assist with calendar sync, network enrichment, and meeting prep.`);
  }

  return (
    <>
      <header className="jarvis-page-header">
        <div>
          <h2 className="page-title">Command Center</h2>
          <p className="page-sub jarvis-sub">
            Axon AI calendar · {lastSync ? `last sync ${new Date(lastSync).toLocaleString()}` : "awaiting sync"}
          </p>
        </div>
      </header>

      <JarvisCommandBar onSubmit={handleCommand} />
      {jarvisReply && <p className="jarvis-reply">{jarvisReply}</p>}

      {!googleConnected && (
        <div className="card banner-warn jarvis-alert">
          Calendar link offline. Open <Link to="/settings">Systems</Link> to reconnect Google.
        </div>
      )}

      <div className="jarvis-action-row">
        <button className="btn" onClick={sync} disabled={syncing || !googleConnected}>
          {syncing ? "Syncing…" : "Sync calendar intelligence"}
        </button>
        {syncNote && <span className="jarvis-status-text">{syncNote}</span>}
      </div>

      <LinkedInPromptPanel suggestions={linkSuggestions} onResolved={load} />

      <section className="jarvis-section">
        <h3 className="jarvis-section-title">Upcoming engagements</h3>
        <UpcomingCalls meetings={meetings} />
      </section>

      <section className="jarvis-section">
        <h3 className="jarvis-section-title">Mission log — past meetings</h3>
        <PastMeetings meetings={pastMeetings} />
      </section>

      {followUps.length > 0 && (
        <section className="jarvis-section">
          <h3 className="jarvis-section-title">Open follow-ups</h3>
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
                  Complete
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
