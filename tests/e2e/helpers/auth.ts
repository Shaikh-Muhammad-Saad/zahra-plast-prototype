import { expect, type Page } from '@playwright/test';

export const DEMO_EMAIL = 'admin@zehraplast.com';
export const DEMO_PASSWORD = 'Zehra@123';
export const AUTH_STORAGE_KEY = 'zehra-plast.auth.v1';

export async function submitLogin(page: Page) {
  await page.locator('input[type="email"]').fill(DEMO_EMAIL);
  await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).not.toBe('/login');
  await expect(page.getByText('Workspace storage: saved', { exact: true })).toBeAttached();
}

export async function login(page: Page) {
  await page.goto('/login');
  await submitLogin(page);
}
