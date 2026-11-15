import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => { await login(page); });

test('brand discounts honor customer/date filters and export numeric summaries', async ({ page }) => {
  await page.goto('/reports');
  await page.getByRole('button', { name: 'Brand discount summary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Brand discount summary', exact: true })).toBeVisible();
  await expect(page.getByText(/catalog averages, not sales totals/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Customer scope', exact: true }).selectOption('c-150');
  const headers = await page.getByRole('columnheader').allTextContents();
  const brand = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'SAFARI', exact: true }) });
  const mean = brand.locator('td').nth(headers.indexOf('Mean effective discount (%)'));
  const pairs = brand.locator('td').nth(headers.indexOf('Priced customer-product pairs'));
  await expect(mean).toHaveText('0');
  await expect(pairs).toHaveText('68');
  await page.getByLabel('Pricing as of', { exact: true }).fill('2026-10-01');
  await expect(mean).toHaveText('Not available');
  await expect(pairs).toHaveText('0');
  await page.getByLabel('Pricing as of', { exact: true }).fill('2026-11-16');
  await page.getByRole('combobox', { name: 'Customer scope', exact: true }).selectOption('c-001');
  await expect.poll(async () => Number(await mean.textContent())).toBeGreaterThan(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const downloaded = await downloading;
  const csv = await readFile((await downloaded.path())!, 'utf8');
  expect(csv).toContain('Mean net / selling unit (PKR)');
  expect(csv).toContain('Mean discount / selling unit (PKR)');
  expect(csv).toContain('Sample Crescent Traders');
  expect(csv).toContain('2026-11-16');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'tmp/qa/brand-summary-mobile.png', fullPage: true });
});
