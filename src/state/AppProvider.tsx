import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createInitialState, products as sourceProducts } from '../../database';
import type { AppState, Permission, User } from '../types';
import { createOperations, hasPermission, refreshEffectiveRates, validateBackup, type AppActions } from './operations';
import { LEGACY_STORAGE_KEY, persistWorkspace, readStoredWorkspace } from './persistence';
import { DEMO_ACCOUNT } from '../../database/auth';
import { readSession } from '../modules/auth/session';

export const STORAGE_KEY = LEGACY_STORAGE_KEY;
type Notification = { id: string; message: string; tone: 'success' | 'error' | 'info' };
type AppContextValue = {
  state: AppState; user: User; actions: AppActions; can: (permission: Permission) => boolean;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  notifications: Notification[]; dismissNotification: (id: string) => void;
  storageError: string; storageStatus: 'saving' | 'saved' | 'error';
};
const AppContext = createContext<AppContextValue | null>(null);
function normalizeWorkspaceAccount(state: AppState): AppState {
  const owner: User = { id: DEMO_ACCOUNT.id, name: DEMO_ACCOUNT.name, email: DEMO_ACCOUNT.email, role: 'Admin', canOverride: true, active: true };
  // Keep legacy users for existing backup/audit compatibility; only this account signs in.
  return { ...state, currentUserId: owner.id, users: [owner, ...state.users.filter(user => user.id !== owner.id)] };
}
function hydrateImages(state: AppState): AppState {
  const images = new Map(sourceProducts.map(p => [p.sourceSerial, p.image]));
  return { ...state, currentUserId: state.users.find(u => u.id === state.currentUserId && u.active)?.id ?? state.users.find(u => u.role === 'Admin' && u.active)!.id,
    products: state.products.map(p => p.image && !/^(data:|https?:|blob:)/.test(p.image) && p.sourceSerial
    ? { ...p, image: images.get(p.sourceSerial) ?? p.image } : p) };
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const current = useRef<AppState | null>(null);
  const revision = useRef(0);
  const [storageError, setStorageError] = useState('');
  const [storageStatus, setStorageStatus] = useState<AppContextValue['storageStatus']>('saving');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  function store(next: AppState) {
    next = normalizeWorkspaceAccount(next);
    current.current = next; setState(next); setStorageStatus('saving');
    const version = ++revision.current;
    void persistWorkspace(next).then(() => {
      if (version === revision.current) { setStorageStatus('saved'); setStorageError(''); }
    }).catch(error => {
      if (version === revision.current) {
        setStorageStatus('error');
        setStorageError(`Changes are available in this tab but could not be saved. Export a backup before closing. ${error instanceof Error ? error.message : 'Browser storage is unavailable.'}`);
      }
    });
  }
  const storeRef = useRef(store); storeRef.current = store;
  const actions = useMemo(() => createOperations(() => {
    if (!readSession()) throw new Error('Please log in to continue.');
    if (!current.current) throw new Error('The workspace is still loading.');
    return current.current;
  }, next => storeRef.current(next), createInitialState), []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let saved = await readStoredWorkspace();
        if (!saved) {
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) saved = JSON.parse(legacy) as AppState;
        }
        if (saved) validateBackup(saved);
        const ready = refreshEffectiveRates(hydrateImages(saved ?? createInitialState()));
        if (!cancelled) storeRef.current(ready);
      } catch (error) {
        if (cancelled) return;
        let fallback = createInitialState();
        try { const legacy = localStorage.getItem(LEGACY_STORAGE_KEY); if (legacy) { const parsed = JSON.parse(legacy) as AppState; validateBackup(parsed); fallback = parsed; } } catch { /* Preserve legacy storage untouched. */ }
        const ready = normalizeWorkspaceAccount(refreshEffectiveRates(hydrateImages(fallback))); current.current = ready; setState(ready); setStorageStatus('error');
        setStorageError(`Saved workspace could not be loaded. ${error instanceof Error ? error.message : ''} Original storage has not been overwritten. Export a backup before making further changes.`);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!current.current) return;
      const next = refreshEffectiveRates(current.current);
      if (next !== current.current) storeRef.current(next);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (storageStatus === 'saved') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storageStatus]);
  const notify = (message: string, tone: Notification['tone'] = 'success') => {
    const notification = { id: crypto.randomUUID(), message, tone };
    setNotifications(items => [...items.slice(-3), notification]);
    window.setTimeout(() => setNotifications(items => items.filter(x => x.id !== notification.id)), tone === 'error' ? 9000 : 5000);
  };
  if (!state) return <div role="status" aria-live="polite" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', textAlign: 'center', gap: 12, color: '#176b54', background: '#f6f8f7', fontFamily: 'sans-serif' }}><strong style={{ fontSize: 24 }}>Zehra Plast</strong><span>Opening your workspace...</span></div>;
  const user = state.users.find(u => u.id === state.currentUserId && u.active) ?? state.users.find(u => u.role === 'Admin' && u.active)!;
  return <AppContext.Provider value={{ state, user, actions, can: permission => hasPermission(user, permission), notify, notifications,
    dismissNotification: id => setNotifications(items => items.filter(x => x.id !== id)), storageError, storageStatus }}>{children}</AppContext.Provider>;
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
