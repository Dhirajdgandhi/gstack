import { useAuth } from "../context/AuthContext";

export default function GuestPage() {
  const { user, logout } = useAuth();

  return (
    <div className="jarvis-guest">
      <div className="jarvis-guest-core">
        <div className="jarvis-orb" aria-hidden />
        <h2 className="jarvis-guest-title">Identity confirmed</h2>
        <p className="jarvis-guest-email">{user?.email}</p>
        <p className="jarvis-guest-msg">
          Authentication successful. Your credentials are valid, but you are not on the team roster.
          Team intelligence — calendar sync, network graph, meeting prep, and shared conversations — is
          classified to <code>TEAM_EMAILS</code> only.
        </p>
        <p className="hint">
          Ask an operator to add your email to the team list, then sign in again.
        </p>
        <button type="button" className="btn secondary" onClick={logout}>
          Disconnect
        </button>
      </div>
    </div>
  );
}
