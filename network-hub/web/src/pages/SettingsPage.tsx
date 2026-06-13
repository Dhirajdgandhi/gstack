import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { ConfigStatus } from "../types";

export default function SettingsPage() {
  const { user, googleConnected, refresh, logout } = useAuth();
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [params] = useSearchParams();

  useEffect(() => {
    api.config.status().then(setConfig).catch(console.error);
    if (params.get("google") === "connected") refresh();
  }, [params, refresh]);

  function connectGoogle() {
    const token = localStorage.getItem("network_hub_token");
    const apiBase = config?.apiUrl ?? "http://localhost:8787";
    window.location.href = `${apiBase}/api/auth/google/start?access_token=${encodeURIComponent(token ?? "")}`;
  }

  const oauthError = params.get("google") === "error" ? params.get("reason") : null;

  return (
    <>
      <h2 className="page-title">Settings</h2>
      <p className="page-sub">Signed in as <strong>{user?.username}</strong>. Contacts you add are visible only to you.</p>

      {params.get("google") === "connected" && (
        <div className="card banner-success">Google Calendar connected successfully.</div>
      )}

      {oauthError && (
        <div className="card banner-warn">
          <strong>Google connection failed</strong>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{oauthError}</p>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Google Calendar</h3>
        <p style={{ color: "var(--muted)" }}>
          Sync upcoming calls from the <strong>{config?.googleCalendarLabel ?? "Axon AI"}</strong> shared calendar only.
          Your Google account must be granted access to that calendar by the owner.
        </p>
        {config?.googleCalendarId && (
          <p className="hint" style={{ marginTop: "0.5rem" }}>
            Calendar: <code className="copy-block" style={{ display: "inline", padding: "0.15rem 0.4rem" }}>{config.googleCalendarLabel}</code>
          </p>
        )}
        {googleConnected ? (
          <p className="badge ready">Connected</p>
        ) : config?.googleCalendar ? (
          <>
            <button className="btn" type="button" onClick={connectGoogle}>
              Connect Google Calendar
            </button>
            <div className="oauth-setup" style={{ marginTop: "1.25rem" }}>
              <strong>If Google shows &quot;request is invalid&quot;</strong>
              <p className="hint" style={{ marginBottom: "0.75rem" }}>
                In Google Cloud Console → APIs &amp; Services → Credentials, open your <strong>Web application</strong> OAuth client (not Desktop) and set:
              </p>
              <p className="hint" style={{ margin: "0.25rem 0" }}>
                <strong>Authorized redirect URIs</strong> (copy exactly):
              </p>
              <code className="copy-block">{config.googleRedirectUri}</code>
              <p className="hint" style={{ margin: "0.75rem 0 0.25rem" }}>
                <strong>Authorized JavaScript origins</strong>:
              </p>
              <code className="copy-block">{config.appUrl}</code>
              <code className="copy-block">{config.apiUrl}</code>
              <p className="hint" style={{ marginTop: "0.75rem" }}>
                Also enable <strong>Google Calendar API</strong> and add your Gmail as a test user on the OAuth consent screen (if app is in Testing mode).
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="error">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to network-hub/.env</p>
            <p className="hint" style={{ marginTop: "0.5rem" }}>
              After editing .env, restart the API server (<code>bun run dev</code>).
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>LinkedIn import</h3>
        <p style={{ color: "var(--muted)" }}>
          Upload a LinkedIn &quot;Save to PDF&quot; export on the Network page — no extra API key needed.
        </p>
        <p className="badge ready">PDF import enabled</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>AI agent</h3>
        <p style={{ color: "var(--muted)" }}>
          After you save a contact or meeting notes, the agent fills in missing summaries, tags, learnings, and next steps.
        </p>
        {config?.aiAgent ? (
          <p className="badge ready">OpenAI connected — full agent mode</p>
        ) : (
          <p className="badge warn">Heuristic mode — add OPENAI_API_KEY to .env for smarter fills</p>
        )}
      </div>

      {config && config.missing.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Missing API keys</h3>
          <ul>
            {config.missing.map((k) => (
              <li key={k}>
                <code>{k}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="btn secondary" type="button" onClick={logout} style={{ marginTop: "1rem" }}>
        Sign out
      </button>
    </>
  );
}
