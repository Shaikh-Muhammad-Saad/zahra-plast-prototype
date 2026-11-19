import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { chooseCustomer } from './helpers/customer';

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await login(page);
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

function searchField(page: Page) { return page.getByRole('combobox', { name: 'Search customers', exact: true }); }

test('pricing customers support mixed-case multiword/name/code search, empty recovery, keyboard selection, and normal tab order', async ({ page }) => {
  await page.goto('/pricing');
  const trigger = page.getByRole('button', { name: 'Pricing customer', exact: true });
  await expect(trigger).toContainText('CUS-001');
  await trigger.click();
  const search = searchField(page);
  await expect(search).toBeFocused();
  await search.fill('  TRADERS   cReScEnT ');
  await expect(page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option')).toContainText('CUS-001');
  await search.fill('no-such-customer-123');
  await expect(page.getByText('No customers found', { exact: true })).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option')).toHaveCount(0);
  await search.press('Enter');
  await expect(search).toBeVisible();
  await expect(trigger).toContainText('CUS-001');
  await search.fill('cus-00');
  await expect(page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option')).toHaveCount(9);
  await search.press('ArrowDown');
  await search.press('ArrowUp');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(trigger).toContainText('Sample City Housewares');
  await expect(trigger).toContainText('CUS-002');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(search).toHaveValue('');
  await search.fill('cUs-001');
  await search.press('Escape');
  await expect(search).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText('CUS-002');
  await trigger.click();
  await search.fill('Crescent');
  await page.getByRole('heading', { name: 'Every customer. The right price.', exact: true }).click();
  await expect(search).not.toBeVisible();
  await trigger.click();
  await expect(search).toHaveValue('');
  await search.fill('Sample City');
  await search.press('Tab');
  await expect(page.getByLabel('Effective on', { exact: true })).toBeFocused();
  await expect(search).not.toBeVisible();
});

test('quote and invoice customer search keeps its parent modal open, preserves keyboard order, and locks after adding a line', async ({ page }) => {
  for (const kind of ['quote', 'invoice']) {
    await page.goto(kind === 'quote' ? '/quotes?new=1' : '/invoices?new=1');
    const editor = page.getByRole('dialog', { name: 'New ' + kind, exact: true });
    const trigger = editor.getByRole('button', { name: 'Customer *', exact: true });
    await trigger.click();
    const search = searchField(page);
    await search.fill('cUs-002');
    await expect(page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option')).toHaveCount(1);
    await search.press('Escape');
    await expect(editor).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText('Select a customer');
    await trigger.click();
    await search.press('Tab');
    const date = editor.getByLabel(kind === 'quote' ? 'Quote date *' : 'Document date *', { exact: true });
    await expect(date).toBeFocused();
    await date.press('Shift+Tab');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await search.press('Shift+Tab');
    await expect(editor.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
    await expect(editor).toBeVisible();
    await chooseCustomer(page, 'Customer *', 'CUS-002');
    await expect(editor.locator('.sales-customer-strip')).toContainText('Sample City Housewares');
    await date.fill('2026-11-18');
    await editor.getByRole('textbox', { name: 'Find a product to add', exact: true }).fill('Grip Bottle Small');
    await editor.getByRole('button', { name: /Grip Bottle Small/ }).click();
    await expect(trigger).toBeDisabled();
    await expect(trigger).toContainText('CUS-002');
    await expect(editor.getByText('Remove lines first to change the customer.', { exact: true })).toBeVisible();
    await expect(search).not.toBeVisible();
    await editor.getByRole('button', { name: 'Remove Grip Bottle Small', exact: true }).click();
    await expect(trigger).toBeEnabled();
    await chooseCustomer(page, 'Customer *', 'CUS-001');
    await expect(editor.locator('.sales-customer-strip')).toContainText('Sample Crescent Traders');
  }
});

test('quote/invoice customer filters support search and can return to all customers', async ({ page }) => {
  for (const route of ['/quotes', '/invoices']) {
    await page.goto(route);
    const rows = page.locator('.sales-register-table tbody tr');
    await expect(rows.first()).toBeVisible();
    const originalCount = await rows.count();
    await chooseCustomer(page, 'Filter documents by customer', 'CUS-150');
    await expect(rows).toHaveCount(0);
    await expect(page.getByText('No matching documents', { exact: true })).toBeVisible();
    await chooseCustomer(page, 'Filter documents by customer', '');
    await expect(rows).toHaveCount(originalCount);
    await chooseCustomer(page, 'Filter documents by customer', 'CUS-005');
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.all()) await expect(row).toContainText('CUS-005');
    await chooseCustomer(page, 'Filter documents by customer', '');
    await expect(rows).toHaveCount(originalCount);
  }

});

async function duplicateLongNames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('zahra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace');
      const request = store.get('current');
      request.onsuccess = () => {
        const state = request.result;
        state.customers[0].name = 'Long Customer Distribution and Wholesale Supplies Pakistan Regional Account';
        state.customers[1].name = state.customers[0].name;
        store.put(state, 'current');
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test('customer search fits a ' + viewport.width + ' by ' + viewport.height + ' viewport and distinguishes duplicate long names by code', async ({ page }) => {
    await duplicateLongNames(page);
    await page.setViewportSize(viewport);
    await page.goto('/invoices?new=1');
    const editor = page.getByRole('dialog', { name: 'New invoice', exact: true });
    const trigger = editor.getByRole('button', { name: 'Customer *', exact: true });
    await trigger.click();
    const search = searchField(page);
    await search.fill('wholesale LONG');
    const popup = page.getByRole('dialog', { name: 'Choose customer *', exact: true });
    await expect(page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option')).toHaveCount(2);
    await expect.poll(async () => {
      const bounds = await popup.boundingBox();
      return !!bounds && bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1;
    }).toBeTruthy();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await expect(search).toBeFocused();
    await page.screenshot({ path: 'tmp/qa/customer-search-' + viewport.width + 'x' + viewport.height + '.png', animations: 'disabled' });
    await page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option', { name: /CUS-002/ }).click();
    await expect(trigger).toContainText('CUS-002');
    await expect(editor).toBeVisible();
    await trigger.click();
    await search.fill('cus-002');
    await expect(page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option')).toHaveAttribute('aria-selected', 'true');
    await search.press('Escape');
    await expect(trigger).toContainText('CUS-002');
    await expect(editor).toBeVisible();
  });
}


test('customer invoice shortcut shows only posted invoices and preserves customer filters through preview and reload', async ({ page }) => {
  test.setTimeout(90_000);
  // Add other document states for the same customer so the shortcut cannot pass
  // by filtering the customer alone. This isolated browser workspace is disposable.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('zahra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace');
      const request = store.get('current');
      request.onsuccess = () => {
        const state = request.result;
        const source = state.documents.find((document: { customerId: string; kind: string; status: string }) =>
          document.customerId === 'c-008' && document.kind === 'Invoice' && document.status === 'Posted');
        state.documents.push(
          { ...structuredClone(source), id: 'shortcut-credit', number: 'QA-CN-SHORTCUT', kind: 'Credit Note', status: 'Posted', sourceDocumentId: source.id },
          { ...structuredClone(source), id: 'shortcut-draft', number: 'QA-INV-DRAFT', status: 'Draft', postedAt: undefined },
          { ...structuredClone(source), id: 'shortcut-reversed', number: 'QA-INV-REVERSED', status: 'Reversed' },
        );
        store.put(state, 'current');
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));

  await page.goto('/customers');
  await page.getByRole('button', { name: 'View Sample Unity Trading', exact: true }).click();
  const customerDialog = page.getByRole('dialog', { name: 'Sample Unity Trading', exact: true });
  for (const name of ['View product discounts', 'View invoices', 'Edit customer']) {
    await expect(customerDialog.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect.poll(() => customerDialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'tmp/qa/customer-invoice-shortcut-desktop.png', animations: 'disabled' });
  await customerDialog.getByRole('button', { name: 'View invoices', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('customer')).toBe('c-008');
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('Posted');
  const customerFilter = page.getByRole('button', { name: 'Filter documents by customer', exact: true });
  const postedTab = page.getByRole('button', { name: 'Posted', exact: true });
  const rows = page.locator('.sales-register-table tbody tr');
  async function expectUnityInvoices() {
    await expect(customerFilter).toContainText('CUS-008');
    await expect(postedTab).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      await expect(row).toContainText('CUS-008');
      await expect(row.locator('td').nth(0).locator('small')).toHaveText('Invoice');
      await expect(row.locator('td').nth(4)).toHaveText('Posted');
      await expect(row).not.toContainText(/QA-CN-SHORTCUT|QA-INV-DRAFT|QA-INV-REVERSED/);
    }
  }
  await expectUnityInvoices();
  await rows.first().locator('.sales-document-link').click();
  const preview = page.getByRole('dialog');
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(preview).not.toBeVisible();
  await expectUnityInvoices();
  await page.reload();
  await expectUnityInvoices();

  await page.getByRole('button', { name: 'Credits', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('QA-CN-SHORTCUT');
  await expect(customerFilter).toContainText('CUS-008');
  await postedTab.click();
  await chooseCustomer(page, 'Filter documents by customer', 'CUS-001');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expect(row).toContainText('CUS-001');

  await page.goto('/customers');
  await page.getByRole('searchbox', { name: /Search customers or codes/ }).fill('CUS-150');
  await page.locator('.customer-cell').click();
  await page.getByRole('dialog').getByRole('button', { name: 'View invoices', exact: true }).click();
  await expect(customerFilter).toContainText('CUS-150');
  await expect(postedTab).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('No posted invoices for this customer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(customerFilter).toContainText('All customers');
  await expect(rows.first()).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/customers');
  await page.getByRole('button', { name: 'View Sample Unity Trading', exact: true }).click();
  await expect(customerDialog).toBeVisible();
  for (const name of ['View product discounts', 'View invoices', 'Edit customer']) {
    await expect(customerDialog.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect.poll(() => customerDialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'tmp/qa/customer-invoice-shortcut-mobile.png', animations: 'disabled' });
  await customerDialog.getByRole('button', { name: 'View invoices', exact: true }).click();
  await expectUnityInvoices();
});
