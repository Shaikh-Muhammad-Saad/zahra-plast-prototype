import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { chooseCustomer } from './helpers/customer';
import { readFile } from 'node:fs/promises';
import type { AppState } from '../../src/types';

test.beforeEach(async ({ page }) => { await login(page); });

async function workspace(page: Page): Promise<AppState> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('zahra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      request.onsuccess = () => { const value = request.result; db.close(); resolve(value); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }));
}

test('editing a product discount changes only that customer and product and persists after reload', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('button', { name: 'Pricing customer', exact: true })).toBeVisible();
  const effectiveDate = await page.getByLabel('Effective on', { exact: true }).inputValue();
  const initial = await workspace(page);
  await page.getByRole('button', { name: 'Edit discount for Grip Bottle Small', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product discount', exact: true });
  await expect(dialog).toContainText('Grip Bottle Small');
  await expect(dialog).toContainText('Sample Crescent Traders');
  await expect(dialog.getByRole('combobox', { name: 'Rule level', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ }).fill('22');
  await dialog.getByRole('button', { name: 'Save discount', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' })).toContainText('22%');
  await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' })).toContainText('121.68');
  const selectedPair = (rule: AppState['rules'][number]) => rule.customerId === 'c-001' && rule.scope === 'product' && rule.targetId === 'p-001';
  await expect.poll(async () => (await workspace(page)).rules.find(selectedPair)?.value).toBe(22);
  const after = await workspace(page);
  expect(after.rules.filter(rule => !selectedPair(rule))).toEqual(initial.rules.filter(rule => !selectedPair(rule)));
  expect(after.documents).toEqual(initial.documents);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' })).toContainText('22%');
  await chooseCustomer(page, 'Pricing customer', 'CUS-002');
  await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' })).not.toContainText('22%');
  await chooseCustomer(page, 'Pricing customer', 'CUS-001');
  await page.getByRole('button', { name: 'Edit discount for Grip Bottle Small', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ })).toHaveValue('22');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: 'tmp/qa/pricing-desktop.png', fullPage: true });

  await page.goto('/invoices?new=1');
  const invoice = page.getByRole('dialog', { name: 'New invoice', exact: true });
  await chooseCustomer(page, 'Customer *', 'CUS-001');
  await invoice.getByLabel('Document date *', { exact: true }).fill(effectiveDate);
  await invoice.getByRole('textbox', { name: 'Find a product to add', exact: true }).fill('Grip Bottle Small');
  await invoice.getByRole('button', { name: /Grip Bottle Small/ }).click();
  const invoiceRow = invoice.getByRole('row').filter({ hasText: 'Grip Bottle Small' });
  await expect(invoiceRow).toContainText('22%');
  await expect(invoiceRow).toContainText('121.68');
  await invoice.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(async () => (await workspace(page)).documents.length).toBe(initial.documents.length + 1);
  const saved = await workspace(page);
  const created = saved.documents.find(document => !initial.documents.some(old => old.id === document.id))!;
  expect(created.customerId).toBe('c-001');
  expect(created.lines[0]).toMatchObject({ productId: 'p-001', listRate: 156, originalPricing: { type: 'percentage', value: 22 }, appliedPricing: { type: 'percentage', value: 22 }, override: false });
  expect(saved.documents.filter(document => document.id !== created.id)).toEqual(initial.documents);
});

test('legacy automatic discounts are ignored and manual discounts apply immediately despite an old approval flag', async ({ page }) => {
  // Simulate restoring an old workspace containing the retired broad-scope rules.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('zahra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace');
      const request = store.get('current');
      request.onsuccess = () => {
        const state = request.result as AppState;
        state.settings.approvalRequired = true;
        state.rules = state.rules.filter(rule => !(rule.customerId === 'c-001' && rule.scope === 'product' && rule.targetId === 'p-002'));
        const product = state.products.find(item => item.id === 'p-002')!;
        const legacy: Array<{ scope: 'brand' | 'category' | 'customer'; targetId: string }> = [
          { scope: 'brand', targetId: product.brand },
          { scope: 'category', targetId: product.category },
          { scope: 'customer', targetId: '' },
        ];
        state.rules.push(...legacy.map((entry, index) => ({ ...entry, id: `legacy-discount-${index}`, customerId: 'c-001', type: 'percentage' as const, value: 90 - index, effectiveFrom: '2026-01-01', effectiveTo: '', active: true, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'Legacy import' })));
        state.rules.push({ id: 'legacy-fixed-price', customerId: 'c-001', scope: 'product', targetId: 'p-002', type: 'fixed', value: 100, effectiveFrom: '2026-01-01', effectiveTo: '', active: true, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'Legacy import' });
        store.put(state, 'current');
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
  await page.goto('/pricing');
  const row = page.getByRole('row').filter({ hasText: 'Grip Bottle Large' });
  await expect(row.getByRole('cell').nth(2)).toHaveText(/0%|No discount/i);
  await expect(row.getByRole('cell').nth(3)).toContainText('175.00');
  const before = await workspace(page);
  await page.getByRole('button', { name: 'Edit discount for Grip Bottle Large', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product discount', exact: true });
  await dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ }).fill('19');
  await dialog.getByRole('button', { name: 'Save discount', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await workspace(page)).rules.find(r => r.customerId === 'c-001' && r.targetId === 'p-002' && r.type === 'percentage')?.value).toBe(19);
  await expect(row).toContainText('19%');
  expect((await workspace(page)).approvals).toEqual(before.approvals);
  expect((await workspace(page)).documents).toEqual(before.documents);
  await expect(page.getByRole('tab', { name: /Approvals/ })).toHaveCount(0);
});

test('Excel price sheet downloads with all catalog rows', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('button', { name: 'Pricing customer', exact: true })).toBeVisible();
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

test('brand-filtered bulk adjustment changes only that customer and the matching products', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('button', { name: 'Pricing customer', exact: true })).toBeVisible();
  const before = await workspace(page);
  await page.getByLabel('Filter by brand', { exact: true }).selectOption('Kiku');
  await page.getByRole('button', { name: 'Bulk update', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /bulk/i });
  await dialog.getByLabel('Update method').selectOption('adjust');
  await dialog.getByLabel('Percentage points to add or subtract').fill('2');
  await dialog.getByRole('button', { name: 'Update 42 products', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const kikuIds = new Set(before.products.filter(product => product.brand === 'Kiku').map(product => product.id));
  const matching = (rule: AppState['rules'][number]) => rule.customerId === 'c-001' && rule.scope === 'product' && kikuIds.has(rule.targetId);
  await expect.poll(async () => (await workspace(page)).rules.filter(matching).length).toBe(42);
  const after = await workspace(page);
  // c-001 has no saved per-product discount for these Kiku products.
  expect(before.rules.filter(matching)).toHaveLength(0);
  expect(after.rules.filter(matching).every(rule => rule.type === 'percentage' && rule.value === 2)).toBeTruthy();
  expect(after.rules.filter(rule => !matching(rule))).toEqual(before.rules.filter(rule => !matching(rule)));
  expect(after.documents).toEqual(before.documents);
});

test('pricing fits a mobile viewport without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/pricing');
  await expect(page.getByRole('button', { name: 'Pricing customer', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'tmp/qa/pricing-mobile.png', fullPage: true });

});
