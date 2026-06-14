import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function GuestPage() {
  const { user, logout } = useAuth();
  const [teamConfigured, setTeamConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api.config.status().then((c) => setTeamConfigured(c.teamConfigured)).catch(() => setTeamConfigured(null));
  }, []);

  return (
    <div className="jarvis-guest">
      <div className="jarvis-guest-core">
        <div className="jarvis-orb" aria-hidden />
        <h2 className="jarvis-guest-title">Identity confirmed</h2>
        <p className="jarvis-guest-email">{user?.email ?? "(no email on session)"}</p>
        <p className="jarvis-guest-msg">
          Authentication successful. Your credentials are valid, but you are not on the team roster.
          Team intelligence — calendar sync, network graph, meeting prep, and shared conversations — is
          classified to <code>TEAM_EMAILS</code> only.
        </p>
        {teamConfigured === false && (
          <p className="error" style={{ marginTop: "1rem" }}>
            Server has no <code>TEAM_EMAILS</code> configured. On Vercel, set it in Project → Environment
            Variables (not just your local <code>.env</code>), then redeploy.
          </p>
        )}
        <p className="hint">
          The roster must include <strong>{user?.email ?? "your Google email"}</strong> exactly. On Vercel,
          add <code>TEAM_EMAILS=ddgandhi.96@gmail.com</code> in project env vars, redeploy, then sign out and
          sign in again.
        </p>
        <button type="button" className="btn secondary" onClick={logout}>
          Disconnect
        </button>
      </div>
    </div>
  );
}
