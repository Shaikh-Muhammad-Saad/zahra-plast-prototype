import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import type { AppState } from '../../src/types';

test.beforeEach(async ({ page }) => { await login(page); });

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

test('the simplified matrix offers percentage discounts and rejects invalid edits without changing saved data', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('columnheader', { name: 'Discount (%)', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Applied from', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Products', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Product comparison', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Discounted products/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Saved rules', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Approvals', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add pricing rule', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy rules', exact: true })).toHaveCount(0);
  const before = await workspace(page);
  await page.getByRole('button', { name: 'Edit discount for Grip Bottle Large', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product discount', exact: true });
  await expect(dialog).toContainText('Grip Bottle Large');
  await expect(dialog).toContainText('Sample Crescent Traders');
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.getByLabel('Net price (PKR per selling unit)', { exact: true })).toHaveCount(0);
  const amount = dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ });
  for (const invalid of ['101', '-1', '']) {
    await amount.fill(invalid);
    await dialog.getByRole('button', { name: 'Save discount', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toBeVisible();
    expect((await workspace(page)).rules).toEqual(before.rules);
  }
  await amount.fill('12.5');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await workspace(page)).rules).toEqual(before.rules);
  expect((await workspace(page)).documents).toEqual(before.documents);
});

test('zero resets a product discount to list price while keeping the selected customer and filters', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/pricing');
  const customer = page.getByRole('combobox', { name: 'Pricing customer', exact: true });
  const brand = page.getByRole('combobox', { name: 'Filter by brand', exact: true });
  const category = page.getByRole('combobox', { name: 'Filter by category', exact: true });
  const search = page.getByRole('searchbox', { name: /Search products or codes/ });
  await customer.selectOption('c-001');
  await brand.selectOption('SAFARI');
  await category.selectOption('School bottle');
  await search.fill('Grip Bottle Small');
  const date = await page.getByLabel('Effective on', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Edit discount for Grip Bottle Small', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product discount', exact: true });
  await dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ }).fill('0');
  await expect(dialog).toContainText('156.00');
  await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  await page.screenshot({ path: 'tmp/qa/product-discount-reset.png' });
  await dialog.getByRole('button', { name: 'Save discount', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(customer).toHaveValue('c-001');
  await expect(brand).toHaveValue('SAFARI');
  await expect(category).toHaveValue('School bottle');
  await expect(search).toHaveValue('Grip Bottle Small');
  await expect(page.getByLabel('Effective on', { exact: true })).toHaveValue(date);
  const row = page.getByRole('row').filter({ hasText: 'Grip Bottle Small' });
  await expect(row.getByRole('cell').nth(2)).toHaveText(/0%|No discount/i);
  await expect(row.getByRole('cell').nth(3)).toContainText('156.00');
  await expect.poll(async () => (await workspace(page)).rules.find(rule => rule.customerId === 'c-001' && rule.scope === 'product' && rule.targetId === 'p-001' && rule.type === 'percentage')?.value).toBe(0);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' }).getByRole('cell').nth(3)).toContainText('156.00');
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test(`a product discount can be edited in a ${viewport.width} by ${viewport.height} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/pricing');
    await expect(page.getByRole('combobox', { name: 'Pricing customer', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.getByRole('button', { name: 'Edit discount for Grip Bottle Small', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit product discount', exact: true });
    await dialog.getByRole('spinbutton', { name: /^Discount \(%\)/ }).fill('7.5');
    await expect(dialog).toContainText('144.30');
    await expect.poll(async () => {
      const box = await dialog.boundingBox();
      return !!box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
    }).toBeTruthy();
    await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    await dialog.getByRole('button', { name: 'Save discount', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `tmp/qa/product-discount-${viewport.width}x${viewport.height}.png` });
    await dialog.getByRole('button', { name: 'Save discount', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Grip Bottle Small' })).toContainText('7.5%');
  });
}
