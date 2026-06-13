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

  function reconnectCalendar() {
    const token = localStorage.getItem("network_hub_token");
    window.location.href = `/api/auth/google/start?access_token=${encodeURIComponent(token ?? "")}`;
  }

  const oauthError = params.get("google") === "error" ? params.get("reason") : null;

  return (
    <>
      <h2 className="page-title">Settings</h2>
      <p className="page-sub">
        Signed in as <strong>{user?.email ?? user?.displayName ?? user?.username}</strong> via Google.
      </p>

      {params.get("google") === "connected" && (
        <div className="card banner-success">Google Calendar reconnected successfully.</div>
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
          Sync upcoming calls from the <strong>{config?.googleCalendarLabel ?? "Axon AI"}</strong> shared calendar.
          Sign-in grants calendar access; your Google account must also be invited to that calendar.
        </p>
        {googleConnected ? (
          <>
            <p className="badge ready">Connected</p>
            <button className="btn secondary" type="button" onClick={reconnectCalendar} style={{ marginTop: "0.75rem" }}>
              Reconnect calendar
            </button>
          </>
        ) : config?.googleCalendar ? (
          <>
            <button className="btn" type="button" onClick={reconnectCalendar}>
              Connect Google Calendar
            </button>
            <div className="oauth-setup" style={{ marginTop: "1.25rem" }}>
              <strong>If Google shows &quot;request is invalid&quot;</strong>
              <p className="hint" style={{ marginBottom: "0.75rem" }}>
                In Google Cloud Console → Credentials → your Web OAuth client:
              </p>
              <p className="hint" style={{ margin: "0.25rem 0" }}>
                <strong>Authorized redirect URIs</strong>:
              </p>
              <code className="copy-block">{config.googleRedirectUri}</code>
              <p className="hint" style={{ margin: "0.75rem 0 0.25rem" }}>
                <strong>Authorized JavaScript origins</strong>:
              </p>
              <code className="copy-block">{config.appUrl}</code>
            </div>
          </>
        ) : (
          <p className="error">Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables</p>
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
          <p className="badge warn">Heuristic mode — add OPENAI_API_KEY for smarter fills</p>
        )}
      </div>

      {config && config.missing.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Missing configuration</h3>
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
