import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { AUTH_STORAGE_KEY, DEMO_EMAIL, DEMO_PASSWORD, login, submitLogin } from './helpers/auth';

const privatePaths = [
  '/', '/products', '/customers', '/suppliers', '/pricing', '/quotes', '/quotes/sample-doc-20',
  '/invoices', '/invoices/sample-doc-1', '/reports', '/audit', '/transfers', '/unknown-page',
];

test('every private route redirects a signed-out visitor to login', async ({ page }) => {
  test.setTimeout(90_000);
  for (const route of privatePaths) {
    await page.goto(route);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveCount(0);
  }
});

test('login displays credentials below the button and rejects incorrect credentials', async ({ page }) => {
  await page.goto('/login');
  const button = page.getByRole('button', { name: 'Log in', exact: true });
  const email = page.getByText(DEMO_EMAIL, { exact: true });
  const password = page.getByText(DEMO_PASSWORD, { exact: true });
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  const buttonBox = await button.boundingBox();
  const credentialBox = await email.boundingBox();
  expect(credentialBox!.y).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height);
  await mkdir('tmp/qa', { recursive: true });
  await page.screenshot({ path: 'tmp/qa/login-desktop.png', fullPage: true });
  await page.locator('input[type="email"]').fill(DEMO_EMAIL);
  await page.locator('input[type="password"]').fill('not-the-password');
  await button.click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/login');
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
});

test('valid login returns to the requested route and survives refresh', async ({ page }) => {
  await page.goto('/products?search=ZP-191#catalog');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await submitLogin(page);
  await expect(page).toHaveURL(/\/products\?search=ZP-191#catalog$/);
  await expect(page.getByRole('row').filter({ hasText: 'Food carrier ultra 4' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Product catalog', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/products\?search=ZP-191#catalog$/);
  await page.goto('/login');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { name: 'Business overview', exact: true })).toBeVisible();
});

test('header only offers logout and logout blocks history and direct navigation', async ({ page }) => {
  await login(page);
  await expect(page.locator('.global-search, .notification-button')).toHaveCount(0);
  await expect(page.locator('.account-name')).not.toContainText(/Admin|Pricing Manager|Finance|Sales \/ Billing/);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/products');
  await page.goto('/invoices');
  await page.locator('.account-menu summary').click();
  const menu = page.locator('.account-dropdown');
  await expect(menu.getByRole('button')).toHaveCount(1);
  await expect(menu.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  await expect(menu).not.toContainText(/Pricing Manager|Finance|Billing User|PREVIEW AS A ROLE/);
  await menu.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  expect(await page.evaluate(key => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await page.goto('/reports');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
});

test('expired and malformed saved sessions cannot reopen protected pages', async ({ page }) => {
  await login(page);
  await page.evaluate(key => {
    const session = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...session, expiresAt: Date.now() - 1 }));
  }, AUTH_STORAGE_KEY);
  await page.reload();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await page.evaluate(key => localStorage.setItem(key, '{invalid json'), AUTH_STORAGE_KEY);
  await page.goto('/products');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('logout also signs out another open workspace tab', async ({ page, context }) => {
  await login(page);
  const other = await context.newPage();
  await other.goto('/products');
  await expect(other.getByRole('heading', { name: 'Product catalog', exact: true })).toBeVisible();
  await page.locator('.account-menu summary').click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect.poll(() => new URL(other.url()).pathname).toBe('/login');
  await expect(other.locator('.app-shell')).toHaveCount(0);
  await other.close();
});

test('the login screen remains readable and usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/login');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByText(DEMO_EMAIL, { exact: true })).toBeVisible();
  await expect(page.getByText(DEMO_PASSWORD, { exact: true })).toBeVisible();
  await mkdir('tmp/qa', { recursive: true });
  await page.screenshot({ path: 'tmp/qa/login-mobile.png', fullPage: true });
  await submitLogin(page);
  await expect(page.getByRole('heading', { name: 'Business overview', exact: true })).toBeVisible();
});
