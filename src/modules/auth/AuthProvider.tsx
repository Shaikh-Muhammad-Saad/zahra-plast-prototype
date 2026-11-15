import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEMO_ACCOUNT } from '../../../database/auth';
import { AUTH_STORAGE_KEY, readSession, SESSION_DURATION, type AuthSession } from './session';

interface AuthContextValue { authenticated: boolean; login: (email: string, password: string) => void; logout: () => void; }
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readSession);
  useEffect(() => {
    const refresh = () => setSession(readSession());
    const onStorage = (event: StorageEvent) => { if (event.key === AUTH_STORAGE_KEY || event.key === null) refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => setSession(readSession()), Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);

  function login(email: string, password: string) {
    if (email.trim().toLowerCase() !== DEMO_ACCOUNT.email || password !== DEMO_ACCOUNT.password) throw new Error('The email or password is incorrect. Please try again.');
    const next: AuthSession = { version: 1, accountId: DEMO_ACCOUNT.id, token: crypto.randomUUID(), expiresAt: Date.now() + SESSION_DURATION };
    try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('Allow browser storage to log in to this workspace.'); }
    setSession(next);
  }
  function logout() {
    try { localStorage.removeItem(AUTH_STORAGE_KEY); }
    finally { setSession(null); }
  }
  return <AuthContext.Provider value={{ authenticated: !!session && session.expiresAt > Date.now(), login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Authentication context is unavailable.');
  return context;
}
