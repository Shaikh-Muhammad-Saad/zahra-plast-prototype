import { test, expect } from '@playwright/test';

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

test('customer creation persists and can be found through the global search', async ({ page }) => {
  await page.goto('/customers');
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a customer' });
  await dialog.getByLabel('Business name', { exact: true }).fill('QA Customer Record');
  await dialog.getByLabel('Customer code', { exact: true }).fill('QA-CUSTOMER-001');
  await dialog.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Workspace storage: saved', { exact: true })).toBeAttached();
  await page.reload();
  await page.getByRole('button', { name: /Search anything/ }).click();
  await page.getByRole('textbox', { name: 'Search workspace', exact: true }).fill('QA-CUSTOMER-001');
  await page.getByRole('button', { name: /QA Customer Record.*QA-CUSTOMER-001/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Search customers or codes…' })).toHaveValue('QA-CUSTOMER-001');
  await expect(page.getByRole('table')).toContainText('QA Customer Record');
});

test('Finance can inspect reports but cannot edit masters or create invoices', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /Finance/ }).click();
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Business overview' })).toBeVisible();
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'Product catalog' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add product', exact: true })).toHaveCount(0);
  await page.goto('/invoices');
  await expect(page.getByRole('button', { name: /New invoice|Create invoice/i })).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports & analytics' })).toBeVisible();
});

test('all modules render without runtime errors and mobile pages stay within the viewport', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const route of ['/', '/products', '/customers', '/suppliers', '/pricing', '/quotes', '/invoices', '/reports', '/audit', '/transfers', '/settings', '/help']) {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  for (const route of ['/', '/products', '/customers', '/suppliers', '/reports', '/settings', '/help']) {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
  expect(errors).toEqual([]);
});
