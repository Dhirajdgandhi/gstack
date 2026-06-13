import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAuthToken } from "../api/client";

interface User {
  id: string;
  username: string;
}

interface AuthState {
  user: User | null;
  googleConnected: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "network_hub_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setGoogleConnected(false);
      setLoading(false);
      return;
    }
    setAuthToken(token);
    try {
      const me = await api.auth.me();
      setUser(me.user);
      setGoogleConnected(me.googleConnected);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.auth.login(username, password);
    localStorage.setItem(TOKEN_KEY, r.token);
    setAuthToken(r.token);
    setUser(r.user);
    const me = await api.auth.me();
    setGoogleConnected(me.googleConnected);
  }, []);

  const signup = useCallback(async (username: string, password: string) => {
    const r = await api.auth.signup(username, password);
    localStorage.setItem(TOKEN_KEY, r.token);
    setAuthToken(r.token);
    setUser(r.user);
    setGoogleConnected(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setGoogleConnected(false);
  }, []);

  const value = useMemo(
    () => ({ user, googleConnected, loading, login, signup, logout, refresh }),
    [user, googleConnected, loading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
