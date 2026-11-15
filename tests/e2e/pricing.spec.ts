import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { readFile } from 'node:fs/promises';
import type { AppState } from '../../src/types';

test.beforeEach(async ({ page }) => { await login(page); });

async function workspace(page: Page): Promise<AppState> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('zehra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      request.onsuccess = () => { const value = request.result; db.close(); resolve(value); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }));
}

test('customer pricing edits persist after reload without changing invoice snapshots', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Every customer. The right price.' })).toBeVisible();
  const initial = await workspace(page);
  await page.getByRole('button', { name: 'Edit pricing for Grip Bottle Small', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit pricing agreement' });
  await dialog.getByLabel('Agreement type').selectOption('percentage');
  await dialog.getByLabel('Discount (%)', { exact: true }).fill('22');
  await dialog.getByRole('button', { name: 'Save agreement', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' })).toContainText('22% off');
  await expect.poll(async () => (await workspace(page)).rules.find(r => r.id === 'sample-product-0')?.value).toBe(22);
  expect((await workspace(page)).documents).toEqual(initial.documents);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' })).toContainText('22% off');
  await page.screenshot({ path: 'tmp/qa/pricing-desktop.png', fullPage: true });
});

test('spreadsheet preview rejects invalid rows and imports only validated pricing', async ({ page }) => {
  await page.goto('/transfers');
  await expect(page.getByRole('heading', { name: 'Bring everything together.' })).toBeVisible();
  const csv = ['customerCode,scope,target,type,value,effectiveFrom,effectiveTo,active',
    'CUS-001,product,ZP-002,percentage,17,2026-11-16,,true',
    'UNKNOWN,product,ZP-003,percentage,150,2026-11-16,,true',
    'CUS-001,product,ZP-002,percentage,20,2026-11-16,,true'].join('\n');
  await page.locator('input[type="file"][accept=".csv,.xlsx"]').setInputFiles({ name: 'pricing-review.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('heading', { name: 'Review your import' })).toBeVisible();
  await expect(page.getByText('Unknown customer code: UNKNOWN')).toBeVisible();
  await expect(page.getByText('Percentage must be between 0 and 100')).toBeVisible();
  await expect(page.getByText('Duplicate row in this file')).toBeVisible();
  await page.getByRole('button', { name: 'Apply 1 valid rows', exact: true }).click();
  await page.getByRole('dialog', { name: 'Apply validated rows?' }).getByRole('button', { name: 'Apply 1 rows', exact: true }).click();
  await expect(page.getByText('1 rows imported; 2 rows rejected.', { exact: true }).first()).toBeVisible();
  await expect.poll(async () => (await workspace(page)).rules.filter(r => r.customerId === 'c-001' && r.targetId === 'p-002').map(r => r.value)).toEqual([17]);
  await page.reload();
  expect((await workspace(page)).rules.some(r => r.customerId === 'c-001' && r.targetId === 'p-002' && r.value === 17)).toBeTruthy();
});

test('an existing approval-enabled workspace holds proposed rules until review', async ({ page }) => {
  // Existing/restored workspaces retain their pricing policy after Settings is removed.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('zehra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace');
      const request = store.get('current');
      request.onsuccess = () => {
        const state = request.result;
        state.settings.approvalRequired = true;
        store.put(state, 'current');
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Edit pricing for Grip Bottle Large', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New pricing agreement' });
  await dialog.getByLabel('Discount (%)', { exact: true }).fill('19');
  await dialog.getByRole('button', { name: 'Submit for approval', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await workspace(page)).approvals.filter(a => a.status === 'Pending').length).toBe(1);
  expect((await workspace(page)).rules.some(r => r.customerId === 'c-001' && r.targetId === 'p-002')).toBeFalsy();
  await page.getByRole('tab', { name: /Approvals/ }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect.poll(async () => (await workspace(page)).rules.find(r => r.customerId === 'c-001' && r.targetId === 'p-002')?.value).toBe(19);
  await expect(page.locator('.pricing-approval').getByText('Approved', { exact: true })).toBeVisible();
});

test('Excel price sheet downloads with all catalog rows', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Every customer. The right price.' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Price sheet', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('customer-pricing-CUS-001.xlsx');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFile((await download.path())!));
  expect(workbook.worksheets[0].rowCount).toBe(318);
  expect(workbook.worksheets[0].getRow(2).getCell(3).value).toBe('Grip Bottle Small');
});

test('brand-filtered bulk adjustment changes product agreements only for that brand', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Every customer. The right price.' })).toBeVisible();
  const before = await workspace(page);
  await page.getByLabel('Filter by brand', { exact: true }).selectOption('Kiku');
  await page.getByRole('button', { name: 'Bulk update', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Update customer prices in bulk' });
  await dialog.getByLabel('Update method').selectOption('adjust');
  await dialog.getByLabel('Percentage points to add or subtract').fill('2');
  await dialog.getByRole('button', { name: 'Update 42 products', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await workspace(page)).rules.filter(rule => rule.customerId === 'c-001' && rule.scope === 'product').length).toBe(43);
  const after = await workspace(page);
  const originalIds = new Set(before.rules.map(rule => rule.id));
  const added = after.rules.filter(rule => !originalIds.has(rule.id));
  expect(added).toHaveLength(42);
  expect(added.every(rule => {
    const product = after.products.find(product => product.id === rule.targetId);
    // The sample customer has 14% on School bottle and a 5% customer default.
    return product?.brand === 'Kiku' && rule.value === (product.category === 'School bottle' ? 16 : 7);
  })).toBeTruthy();
  expect(after.documents).toEqual(before.documents);
});

test('pricing and transfers fit a mobile viewport without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Every customer. The right price.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'tmp/qa/pricing-mobile.png', fullPage: true });
  await page.goto('/transfers');
  await expect(page.getByRole('heading', { name: 'Bring everything together.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'tmp/qa/transfers-mobile.png', fullPage: true });
});
