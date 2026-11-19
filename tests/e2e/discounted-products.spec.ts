import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { chooseCustomer } from './helpers/customer';
import type { AppState, DiscountRule } from '../../src/types';

test.beforeEach(async ({ page }) => { await login(page); });

function discount(targetId: string, value: number, overrides: Partial<DiscountRule> = {}): DiscountRule {
  return {
    id: `test-${overrides.customerId ?? 'c-001'}-${targetId || 'default'}-${overrides.scope ?? 'product'}`,
    customerId: 'c-001', scope: 'product', targetId, type: 'percentage', value,
    effectiveFrom: '2026-10-20', effectiveTo: '', active: true,
    updatedAt: '2026-10-20T00:00:00.000Z', updatedBy: 'Browser test', ...overrides,
  };
}

async function replaceDiscounts(page: Page, rules: DiscountRule[]) {
  await page.evaluate(records => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('zahra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace');
      const request = store.get('current');
      request.onsuccess = () => { const state = request.result; state.rules = records; store.put(state, 'current'); };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), rules);
  await page.goto('/pricing');
  await page.getByLabel('Effective on', { exact: true }).fill('2026-11-18');
  await page.getByRole('tab', { name: /^Discounted products/ }).click();
}

async function workspace(page: Page): Promise<AppState> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('zahra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      request.onsuccess = () => { const state = request.result; db.close(); resolve(state); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }));
}

async function resetDiscount(page: Page, productName: string) {
  await page.getByRole('button', { name: `Edit discount for ${productName}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product discount', exact: true });
  await dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ }).fill('0');
  await dialog.getByRole('button', { name: 'Save discount', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test('discounted products follows the selected customer and date and removing the final discount shows the empty state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await replaceDiscounts(page, [
    discount('p-001', 10, { effectiveFrom: '2026-11-01' }),
    discount('p-002', 0),
    discount('p-003', 20, { effectiveTo: '2026-11-10' }),
    discount('p-004', 25, { effectiveFrom: '2026-12-01' }),
    discount('p-005', 30, { active: false }),
    discount('p-006', 100, { type: 'fixed' }),
    discount('SAFARI', 50, { scope: 'brand' }),
    discount('School bottle', 40, { scope: 'category' }),
    discount('', 35, { scope: 'customer' }),
    discount('p-007', 12, { customerId: 'c-002' }),
  ]);
  const rows = page.locator('.pricing-table tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Grip Bottle Small');
  await expect(rows.first()).toContainText('10%');
  await expect(rows.first()).toContainText('140.40');
  await expect(page.getByRole('tab', { name: 'Product comparison', exact: true })).toHaveCount(0);
  await chooseCustomer(page, 'Pricing customer', 'CUS-002');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('U bottle');
  await expect(rows.first()).toContainText('12%');
  await expect(rows.first()).toContainText('145.20');
  await chooseCustomer(page, 'Pricing customer', 'CUS-001');
  await page.getByLabel('Effective on', { exact: true }).fill('2026-11-05');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'grace bottle' })).toContainText('124.00');
  await page.getByLabel('Effective on', { exact: true }).fill('2026-12-01');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'sunny school bottle' })).toContainText('127.50');
  await expect(rows.filter({ hasText: 'grace bottle' })).toHaveCount(0);
  await page.getByLabel('Effective on', { exact: true }).fill('2026-11-18');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(rows).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'tmp/qa/discounted-products-mobile.png', fullPage: true, animations: 'disabled' });
  await resetDiscount(page, 'Grip Bottle Small');
  await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: 'View all products', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Products', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(rows).toHaveCount(12);
  await expect(rows.filter({ hasText: 'Grip Bottle Small' }).getByRole('cell').nth(2)).toContainText('0%');
  expect(errors).toEqual([]);
});

test('removing the only discount on the last page returns to the previous valid page', async ({ page }) => {
  await replaceDiscounts(page, Array.from({ length: 13 }, (_, index) => discount(`p-${String(index + 1).padStart(3, '0')}`, 10)));
  const rows = page.locator('.pricing-table tbody tr');
  await expect(rows).toHaveCount(12);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('sports bottle');
  await resetDiscount(page, 'sports bottle');
  await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(12);
  await expect(rows.filter({ hasText: 'sports bottle' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect.poll(async () => (await workspace(page)).rules.find(rule => rule.targetId === 'p-013')?.value).toBe(0);
});

test('filters and bulk updates affect only matching discounted products for the selected customer', async ({ page }) => {
  await replaceDiscounts(page, [
    discount('p-001', 10), discount('p-002', 0), discount('p-003', 30),
    discount('p-057', 40), discount('p-061', 25), discount('p-001', 50, { customerId: 'c-002' }),
  ]);
  const before = await workspace(page);
  const rows = page.locator('.pricing-table tbody tr');
  await expect(rows).toHaveCount(4);
  await page.getByRole('combobox', { name: 'Filter by brand', exact: true }).selectOption('SAFARI');
  await expect(rows).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Filter by category', exact: true }).selectOption('School bottle');
  await expect(rows).toHaveCount(2);
  await page.getByRole('searchbox', { name: /Search products or codes/ }).fill('Grip Bottle');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Grip Bottle Small');
  await page.screenshot({ path: 'tmp/qa/discounted-products-filtered.png', fullPage: true });
  await page.getByRole('button', { name: 'Bulk update', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Update product discounts in bulk', exact: true });
  await dialog.getByRole('combobox', { name: 'Update method', exact: true }).selectOption('percentage');
  await dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ }).fill('17');
  await dialog.getByRole('button', { name: 'Update 1 products', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(rows.first()).toContainText('17%');
  const selected = (rule: DiscountRule) => rule.customerId === 'c-001' && rule.targetId === 'p-001';
  await expect.poll(async () => (await workspace(page)).rules.find(selected)?.value).toBe(17);
  const after = await workspace(page);
  expect(after.rules.filter(rule => !selected(rule))).toEqual(before.rules.filter(rule => !selected(rule)));
  expect(after.documents).toEqual(before.documents);
});
