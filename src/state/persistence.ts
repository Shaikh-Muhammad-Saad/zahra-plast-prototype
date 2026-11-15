import type { AppState } from '../types';

export const LEGACY_STORAGE_KEY = 'zehra-plast.workspace.v1';
export const DATABASE_NAME = 'zehra-plast-local';
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
    request.onblocked = () => { opening = undefined; reject(new Error('Close other Zehra Plast tabs, then reload to open local storage.')); };
  });
  return opening;
}
export async function readStoredWorkspace(): Promise<AppState | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result as AppState | undefined);
    request.onerror = () => reject(request.error ?? new Error('Saved workspace could not be read.'));
  });
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
