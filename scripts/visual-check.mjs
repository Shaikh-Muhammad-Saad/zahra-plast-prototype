import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('tmp/qa', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:5173/login');
await page.locator('input[type="email"]').fill('admin@zehraplast.com');
await page.locator('input[type="password"]').fill('Zehra@123');
await page.getByRole('button', { name: 'Log in', exact: true }).click();
await page.waitForURL('http://127.0.0.1:5173/');
for (const [path, name] of [['/', 'overview'], ['/products', 'catalog'], ['/pricing', 'pricing'], ['/invoices', 'invoices'], ['/transfers', 'transfers']]) {
  await page.goto(`http://127.0.0.1:5173${path}`);
  await page.locator('h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `tmp/qa/${name}.png`, fullPage: true });
  console.log(`${name}: ${await page.locator('h1').textContent()}`);
}
await page.setViewportSize({ width: 390, height: 844 });
for (const [path, name] of [['/', 'overview-mobile'], ['/products', 'catalog-mobile'], ['/pricing', 'pricing-mobile']]) {
  await page.goto(`http://127.0.0.1:5173${path}`); await page.locator('h1').waitFor();
  await page.screenshot({ path: `tmp/qa/${name}.png`, fullPage: true });
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  console.log(`${name}: ${JSON.stringify(layout)}`);
}
console.log('Page errors:', JSON.stringify(errors));
await browser.close();
if (errors.length) process.exitCode = 1;
