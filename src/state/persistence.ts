import type { AppState } from '../types';

export const LEGACY_STORAGE_KEY = 'zahra-plast.workspace.v1';
export const DATABASE_NAME = 'zahra-plast-local';
// Compatibility only: retain access to workspaces saved before the branding correction.
const PREVIOUS_STORAGE_KEY = 'zehra-plast.workspace.v1';
const PREVIOUS_DATABASE_NAME = 'zehra-plast-local';
const STORE = 'workspace';
const KEY = 'current';
let opening: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser does not support local workspace storage.')); return; }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = undefined; }; resolve(db); };
    request.onerror = () => { opening = undefined; reject(request.error ?? new Error('Local workspace storage could not be opened.')); };
    request.onblocked = () => { opening = undefined; reject(new Error('Close other Zahra Plast tabs, then reload to open local storage.')); };
  });
  return opening;
}
function readWorkspace(db: IDBDatabase): Promise<AppState | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result as AppState | undefined);
    request.onerror = () => reject(request.error ?? new Error('Saved workspace could not be read.'));
  });
}
async function readPreviousWorkspace(): Promise<AppState | undefined> {
  const db = await new Promise<IDBDatabase | undefined>((resolve, reject) => {
    const request = indexedDB.open(PREVIOUS_DATABASE_NAME);
    let missing = false;
    // Abort creation when this browser never had the previous database.
    request.onupgradeneeded = () => { missing = true; request.transaction?.abort(); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => missing ? resolve(undefined) : reject(request.error ?? new Error('The previous workspace could not be opened.'));
    request.onblocked = () => reject(new Error('Close other Zahra Plast tabs, then reload to migrate local storage.'));
  });
  if (!db) return undefined;
  try { return db.objectStoreNames.contains(STORE) ? await readWorkspace(db) : undefined; }
  finally { db.close(); }
}
export async function readStoredWorkspace(): Promise<AppState | undefined> {
  const saved = await readWorkspace(await openDatabase());
  // The provider validates and saves the migrated snapshot; original storage stays untouched.
  return saved ?? await readPreviousWorkspace();
}
export function readLegacyWorkspace(): AppState | undefined {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY) ?? localStorage.getItem(PREVIOUS_STORAGE_KEY);
  return raw ? JSON.parse(raw) as AppState : undefined;
}
async function commitWorkspace(state: AppState): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(state, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('The workspace could not be saved to this browser.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('The local save was interrupted.'));
  });
}
// Coalesce queued snapshots while serializing atomic transactions. A promise only
// resolves after a snapshot containing that change has been committed.
let sequence = 0;
let latest: { sequence: number; state: AppState } | undefined;
let writing = false;
let waiters: { sequence: number; resolve: () => void; reject: (error: Error) => void }[] = [];
let lastPersistence: Promise<void> = Promise.resolve();
export function persistWorkspace(state: AppState): Promise<void> {
  const nextSequence = ++sequence;
  latest = { sequence: nextSequence, state };
  const result = new Promise<void>((resolve, reject) => waiters.push({ sequence: nextSequence, resolve, reject }));
  lastPersistence = result;
  if (!writing) void drain();
  return result;
}
async function drain() {
  writing = true;
  while (latest) {
    const batch = latest; latest = undefined;
    try {
      await commitWorkspace(batch.state);
      const completed = waiters.filter(w => w.sequence <= batch.sequence);
      waiters = waiters.filter(w => w.sequence > batch.sequence);
      completed.forEach(w => w.resolve());
    } catch (error) {
      const failed = waiters.filter(w => w.sequence <= batch.sequence);
      waiters = waiters.filter(w => w.sequence > batch.sequence);
      failed.forEach(w => w.reject(error instanceof Error ? error : new Error('Local save failed.')));
    }
  }
  writing = false;
}
export function flushPersistence(): Promise<void> { return lastPersistence; }
