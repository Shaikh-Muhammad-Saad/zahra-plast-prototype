import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.beforeEach(async ({ page }) => { await login(page); });

test('the full catalog is searchable, source details are preserved, and photos load', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'Product catalog', exact: true })).toBeVisible();
  await expect(page.locator('.stats-grid').first()).toContainText('317');
  await expect(page.locator('.product-image img').first()).toBeVisible();
  expect(await page.locator('.product-image img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await page.getByRole('searchbox', { name: 'Search product name or code…' }).fill('ZP-191');
  const row = page.getByRole('row').filter({ hasText: 'Food carrier ultra 4' });
  await expect(row).toContainText('105');
  await expect(row).toContainText('Inactive');
  await row.getByRole('button', { name: 'View Food carrier ultra 4', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('PDF #191, page 13');
  await expect(page.getByRole('dialog')).toContainText('Cost price');
});

test('customer creation persists and can be found through the customer search', async ({ page }) => {
  await page.goto('/customers');
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a customer' });
  await dialog.getByLabel('Business name', { exact: true }).fill('QA Customer Record');
  await dialog.getByLabel('Customer code', { exact: true }).fill('QA-CUSTOMER-001');
  await dialog.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Workspace storage: saved', { exact: true })).toBeAttached();
  await page.reload();
  await page.getByRole('searchbox', { name: /Search customers or codes/ }).fill('QA-CUSTOMER-001');
  await expect(page.getByRole('table')).toContainText('QA Customer Record');
});

test('the workspace account can maintain products without removed sidebar controls', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('button', { name: 'Add product', exact: true })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await expect(page.locator('.sidebar .workspace-note')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Role', exact: true })).toHaveCount(0);
});

test('all modules render without runtime errors and mobile pages stay within the viewport', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const route of ['/', '/products', '/customers', '/suppliers', '/pricing', '/quotes', '/invoices']) {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
  }
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.getByText('INSIGHTS', { exact: true })).toHaveCount(0);
  for (const name of ['Reports & analytics', 'Activity log', 'Import & export']) {
    await expect(sidebar.getByRole('link', { name, exact: true })).toHaveCount(0);
  }
  await sidebar.screenshot({ path: 'tmp/qa/sidebar-simplified-desktop.png' });
  for (const route of ['/reports', '/audit', '/transfers']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to overview', exact: true })).toHaveAttribute('href', '/');
  }
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ['/', '/products', '/customers', '/suppliers']) {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(sidebar).toHaveClass(/sidebar-open/);
  await page.screenshot({ path: 'tmp/qa/sidebar-simplified-mobile.png', animations: 'disabled' });
  expect(errors).toEqual([]);
});
