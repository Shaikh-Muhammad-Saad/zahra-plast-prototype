import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { mkdir, readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => { await login(page); });

test('all export cards download complete PDFs while Excel remains available', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('tmp/pdfs', { recursive: true });
  await mkdir('tmp/qa', { recursive: true });
  await page.goto('/transfers');
  await page.getByRole('tab', { name: 'Export & backup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'CSV', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Excel', exact: true })).toHaveCount(6);
  await page.screenshot({ path: 'tmp/qa/transfers-pdf-desktop.png', fullPage: true });

  const exports = [
    ['Products', 'zehra-plast-products.pdf'],
    ['Customers', 'zehra-plast-customers.pdf'],
    ['Suppliers', 'zehra-plast-suppliers.pdf'],
    ['Pricing rules', 'zehra-plast-discounts.pdf'],
    ['Current rate list', 'zehra-plast-rates.pdf'],
    ['Complete customer matrix', 'zehra-plast-complete-customer-matrix.pdf'],
  ];

  for (const [title, filename] of exports) {
    await test.step(title, async () => {
      const card = page.locator('section.transfer-export-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      const downloading = page.waitForEvent('download', { timeout: 150_000 });
      await card.getByRole('button', { name: 'PDF', exact: true }).click();
      if (title === 'Complete customer matrix') {
        // A large export must not block normal controls on the browser's UI thread.
        await page.getByRole('tab', { name: /Rate list history/ }).click({ timeout: 3_000 });
        await expect(page.getByRole('heading', { name: 'Rate list versions', exact: true })).toBeVisible({ timeout: 3_000 });
        await page.getByRole('tab', { name: 'Export & backup', exact: true }).click({ timeout: 3_000 });
      }
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(filename);
      expect(await download.failure()).toBeNull();
      await download.saveAs(`tmp/pdfs/${filename}`);
      const bytes = await readFile(`tmp/pdfs/${filename}`);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.subarray(-1024).toString()).toContain('%%EOF');
      await expect(card.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled();
    });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: 'tmp/qa/transfers-pdf-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
