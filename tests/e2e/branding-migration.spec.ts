import { test, expect, type Page } from '@playwright/test';
import type { AppState } from '../../src/types';
import { submitLogin } from './helpers/auth';

// Compatibility fixtures deliberately use the storage names and default brand from the previous release.
const previousDatabase = 'zehra-plast-local';
const previousStorageKey = 'zehra-plast.workspace.v1';
const currentDatabase = 'zahra-plast-local';

function savedWorkspace(companyName: string): AppState {
  return {
    schemaVersion: 1, products: [], suppliers: [], documents: [], audit: [], rateVersions: [], approvals: [],
    customers: [{ id: 'retained-customer', code: 'RETAINED-001', name: 'Existing customer', contact: 'Original contact', email: '', phone: '', address: '', paymentTerms: '', group: '', status: 'Active', sample: false }],
    rules: [{ id: 'retained-rule', customerId: 'retained-customer', scope: 'customer', targetId: '', type: 'percentage', value: 17, effectiveFrom: '2026-01-01', effectiveTo: '', active: true, updatedAt: '2026-01-01T00:00:00Z', updatedBy: 'Previous owner' }],
    users: [{ id: 'previous-owner', name: 'Previous owner', email: 'owner@example.com', role: 'Admin', canOverride: true, active: true }],
    currentUserId: 'previous-owner',
    settings: { companyName, address: 'Existing business address', phone: '', email: '', approvalRequired: false, overrideReasonRequired: true, allowSaveToMatrix: false, brandCategoryPriority: 'brand', invoicePrefix: 'INV', quotePrefix: 'QT' },
  };
}

async function readWorkspace(page: Page, databaseName = currentDatabase): Promise<AppState> {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const opening = indexedDB.open(name, 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }), databaseName);
}

for (const scenario of [
  { source: 'indexedDB', companyName: 'Zehra Plast', expectedName: 'Zahra Plast' },
  { source: 'localStorage', companyName: 'Zehra Plast', expectedName: 'Zahra Plast' },
  { source: 'indexedDB', companyName: 'Custom business name', expectedName: 'Custom business name' },
] as const) {
  test(`branding migration preserves ${scenario.source} data and ${scenario.companyName === scenario.expectedName ? 'custom company names' : 'corrects the previous default'}`, async ({ page }) => {
    const original = savedWorkspace(scenario.companyName);
    await page.goto('/login');
    await page.evaluate(async ({ state, source, databaseName, storageKey }) => {
      if (source === 'localStorage') { localStorage.setItem(storageKey, JSON.stringify(state)); return; }
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open(databaseName, 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore('workspace');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction('workspace', 'readwrite');
          transaction.objectStore('workspace').put(state, 'current');
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
      });
    }, { state: original, source: scenario.source, databaseName: previousDatabase, storageKey: previousStorageKey });

    await submitLogin(page);
    const migrated = await readWorkspace(page);
    expect(migrated.customers).toEqual(original.customers);
    expect(migrated.rules).toEqual(original.rules);
    expect(migrated.settings).toEqual({ ...original.settings, companyName: scenario.expectedName });
    expect(migrated.users.find(user => user.id === migrated.currentUserId)?.name).toBe('Zahra Plast');

    await page.reload();
    await expect(page.getByText('Workspace storage: saved', { exact: true })).toBeAttached();
    expect(await readWorkspace(page)).toEqual(migrated);
    if (scenario.source === 'indexedDB') expect(await readWorkspace(page, previousDatabase)).toEqual(original);
    else expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), previousStorageKey)).toEqual(original);
  });
}
