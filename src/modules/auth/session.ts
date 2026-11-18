import { DEMO_ACCOUNT } from '../../../database/auth';

export const AUTH_STORAGE_KEY = 'zahra-plast.auth.v1';
export const SESSION_DURATION = 24 * 60 * 60 * 1000;
export interface AuthSession { version: 1; accountId: string; expiresAt: number; token: string; }

export function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AuthSession>;
    if (value.version !== 1 || value.accountId !== DEMO_ACCOUNT.id || typeof value.token !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.token)
      || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) return null;
    const now = Date.now();
    if (value.expiresAt <= now) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    if (value.expiresAt > now + SESSION_DURATION) return null;
    return value as AuthSession;
  } catch { return null; }
}

export function loginDestination(from: unknown): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return '/';
  try {
    const url = new URL(from, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.replace(/\/+$/, '') === '/login') return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
