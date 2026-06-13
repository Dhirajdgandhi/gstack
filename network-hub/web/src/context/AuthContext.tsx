import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAuthToken } from "../api/client";

interface User {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
}

interface AuthState {
  user: User | null;
  googleConnected: boolean;
  isTeamMember: boolean;
  loading: boolean;
  finishGoogleLogin: (token: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "network_hub_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyMe = useCallback(
    (me: { user: User; googleConnected: boolean; isTeamMember: boolean }) => {
      setUser(me.user);
      setGoogleConnected(me.googleConnected);
      setIsTeamMember(me.isTeamMember);
    },
    [],
  );

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setGoogleConnected(false);
      setIsTeamMember(false);
      setLoading(false);
      return;
    }
    setAuthToken(token);
    try {
      const me = await api.auth.me();
      applyMe(me);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      setUser(null);
      setIsTeamMember(false);
    } finally {
      setLoading(false);
    }
  }, [applyMe]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const finishGoogleLogin = useCallback(
    async (token: string) => {
      localStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      const me = await api.auth.me();
      applyMe(me);
      setLoading(false);
    },
    [applyMe],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setGoogleConnected(false);
    setIsTeamMember(false);
  }, []);

  const value = useMemo(
    () => ({ user, googleConnected, isTeamMember, loading, finishGoogleLogin, logout, refresh }),
    [user, googleConnected, isTeamMember, loading, finishGoogleLogin, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
