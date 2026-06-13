import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import JarvisBoot from "../components/JarvisBoot";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { user, loading, finishGoogleLogin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    const token = params.get("token");
    const oauthError = params.get("error");
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
      setParams({}, { replace: true });
      return;
    }
    if (token) {
      finishGoogleLogin(token)
        .catch((err) => setError(err instanceof Error ? err.message : "Sign-in failed"))
        .finally(() => setParams({}, { replace: true }));
    }
  }, [params, setParams, finishGoogleLogin]);

  if (!loading && user) return <Navigate to="/" replace />;

  function signInWithGoogle() {
    window.location.href = "/api/auth/google/login";
  }

  return (
    <div className="auth-page jarvis-auth">
      <div className="jarvis-grid-bg" aria-hidden />
      <div className="auth-card card jarvis-panel">
        <div className="jarvis-logo">
          <span className="jarvis-logo-mark">◈</span>
          <div>
            <h1>JARVIS</h1>
            <p className="jarvis-tagline">Network Intelligence System</p>
          </div>
        </div>

        {!bootDone ? (
          <JarvisBoot onComplete={() => setBootDone(true)} />
        ) : (
          <>
            <p className="jarvis-voice">
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}.
              Authenticate to access team intelligence and help build the future.
            </p>

            {error && <p className="error jarvis-error">{error}</p>}

            <button className="btn btn-block jarvis-google-btn" type="button" onClick={signInWithGoogle}>
              <span className="google-g">G</span>
              Authenticate with Google
            </button>

            <p className="hint auth-footer">
              Open sign-in · team content visible only to roster in <code>TEAM_EMAILS</code>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
