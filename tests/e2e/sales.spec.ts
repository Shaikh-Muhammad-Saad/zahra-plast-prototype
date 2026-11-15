import { test, expect, type Page } from '@playwright/test';
import type { AppState } from '../../src/types';

async function savedState(page: Page): Promise<AppState> {
  await expect(page.locator('[role="status"]').filter({ hasText: 'Workspace storage: saved' })).toHaveCount(1);
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('zehra-plast-local', 1);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => reject(get.error);
    };
    request.onerror = () => reject(request.error);
  }));
}

async function addProduct(page: Page, name = 'Grip Bottle Small') {
  const editor = page.getByRole('dialog');
  await editor.getByRole('textbox', { name: 'Find a product to add' }).fill(name);
  await editor.getByRole('button', { name: new RegExp(name) }).click();
  await expect(editor.locator('.sales-line-product')).toContainText(name);
}

async function startDocument(page: Page, kind: 'invoice' | 'quote' = 'invoice') {
  await page.goto(kind === 'invoice' ? '/invoices?new=1' : '/quotes?new=1');
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('heading', { name: `New ${kind}`, exact: true })).toBeVisible();
  await savedState(page);
  await editor.getByRole('combobox', { name: 'Customer *', exact: true }).selectOption({ index: 1 });
  await editor.locator('input[type="date"]').first().fill('2026-11-16');
  await addProduct(page);
  return editor;
}

test('draft override preserves the matrix, posting locks pricing, and a partial return preserves the original rate', async ({ page }) => {
  await page.goto('/invoices');
  const before = await savedState(page);
  const editor = await startDocument(page);
  await editor.getByRole('spinbutton', { name: 'Quantity for Grip Bottle Small' }).fill('10');
  await editor.getByRole('button', { name: 'Change discount for Grip Bottle Small' }).click();
  const override = editor.getByRole('region', { name: 'Invoice discount override' });
  await override.getByRole('spinbutton', { name: 'Override percentage' }).fill('12.5');
  await override.getByRole('combobox', { name: /^Reason/ }).selectOption('Customer agreement');
  await override.getByRole('button', { name: 'Apply override', exact: true }).click();
  await expect(editor.getByText('Manual override', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit draft' })).toBeVisible();
  const draftState = await savedState(page);
  const created = draftState.documents.find(document => !before.documents.some(old => old.id === document.id))!;
  expect(created.status).toBe('Draft');
  expect(created.lines[0].appliedPricing).toMatchObject({ type: 'percentage', value: 12.5 });
  expect(created.lines[0].override).toBe(true);
  expect(created.lines[0].reason).toBe('Customer agreement');
  expect(draftState.rules).toEqual(before.rules);
  await page.getByRole('dialog').getByRole('button', { name: 'Post document', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Pricing locked', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit draft' })).toHaveCount(0);
  const postedState = await savedState(page);
  expect(postedState.documents.find(document => document.id === created.id)?.status).toBe('Posted');
  expect(postedState.rules).toEqual(before.rules);
  await page.reload();
  await expect(page.getByRole('dialog').getByText('Pricing locked', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return / credit note', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Reason *', exact: true }).fill('Customer returned two selling packs');
  await page.getByRole('button', { name: 'Prepare credit note', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Post credit note', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('spinbutton', { name: 'Quantity for Grip Bottle Small' }).fill('2');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Change discount for Grip Bottle Small' })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Post credit note', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Pricing locked', { exact: true })).toBeVisible();
  const creditState = await savedState(page);
  const credit = creditState.documents.find(document => document.kind === 'Credit Note' && document.sourceDocumentId === created.id)!;
  expect(credit.status).toBe('Posted');
  expect(credit.lines[0].quantity).toBe(2);
  expect(credit.lines[0].listRate).toBe(created.lines[0].listRate);
  expect(credit.lines[0].appliedPricing).toEqual(created.lines[0].appliedPricing);
  expect(creditState.rules).toEqual(before.rules);
  await page.screenshot({ path: 'tmp/sales-posted-credit.png', fullPage: true });
});

test('a quote conversion carries its override label and exact saved pricing into a new invoice', async ({ page }) => {
  const editor = await startDocument(page, 'quote');
  const before = await savedState(page);
  await editor.getByRole('button', { name: 'Adjust all lines', exact: true }).click();
  const override = editor.getByRole('region', { name: 'Invoice discount override' });
  await override.getByRole('combobox', { name: 'Discount type', exact: true }).selectOption('fixed');
  await override.getByRole('spinbutton', { name: 'Override fixed net price' }).fill('130');
  await override.getByRole('combobox', { name: /^Reason/ }).selectOption('Manager approval');
  await expect(override).toContainText('same net price');
  await override.getByRole('button', { name: 'Apply to all lines', exact: true }).click();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  const quoteState = await savedState(page);
  const quote = quoteState.documents.find(document => !before.documents.some(old => old.id === document.id))!;
  expect(quote.kind).toBe('Quote');
  await page.getByRole('dialog').getByRole('button', { name: 'Convert to invoice', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Post invoice', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Save draft', exact: true }).click();
  const invoiceState = await savedState(page);
  const invoice = invoiceState.documents.find(document => document.kind === 'Invoice' && document.sourceDocumentId === quote.id)!;
  expect(invoiceState.documents.find(document => document.id === quote.id)?.status).toBe('Converted');
  expect(invoice.lines).toEqual(quote.lines);
  expect(invoice.lines[0].appliedPricing).toMatchObject({ type: 'fixed', value: 130 });
  expect(invoice.lines[0].override).toBe(true);
  expect(invoiceState.rules).toEqual(before.rules);
  await page.screenshot({ path: 'tmp/sales-converted-quote.png', fullPage: true });
});

test('carton ordering uses selling packs and resetting an override restores the applicable matrix', async ({ page }) => {
  const editor = await startDocument(page);
  await editor.getByRole('combobox', { name: 'Order unit for Grip Bottle Small' }).selectOption('carton');
  await expect(editor.getByText('96 selling packs', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Change discount for Grip Bottle Small' }).click();
  const override = editor.getByRole('region', { name: 'Invoice discount override' });
  await override.getByRole('spinbutton', { name: 'Override percentage' }).fill('101');
  await override.getByRole('button', { name: 'Apply override', exact: true }).click();
  await expect(override.getByRole('alert')).toContainText('between 0 and 100');
  await override.getByRole('spinbutton', { name: 'Override percentage' }).fill('15');
  await override.getByRole('combobox', { name: /^Reason/ }).selectOption('Sales adjustment');
  await override.getByRole('button', { name: 'Apply override', exact: true }).click();
  await editor.getByRole('button', { name: 'Reset Grip Bottle Small to matrix', exact: true }).click();
  await expect(editor.getByText('Manual override', { exact: true })).toHaveCount(0);
  await expect(editor.getByText('Matrix', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  const state = await savedState(page);
  const newest = state.documents.filter(document => document.kind === 'Invoice').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  expect(newest.lines[0].unit).toBe('carton');
  expect(newest.lines[0].quantity).toBe(1);
  expect(newest.lines[0].cartonQuantity).toBe(96);
  expect(newest.lines[0].override).toBe(false);
  expect(newest.lines[0].appliedPricing).toEqual(newest.lines[0].originalPricing);
});
