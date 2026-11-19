import { expect, type Page } from '@playwright/test';

/** Select through the customer search UI, keeping business tests independent of its markup. */
export async function chooseCustomer(page: Page, label: string, code: string) {
  const trigger = page.getByRole('button', { name: label, exact: true });
  await trigger.click();
  const search = page.getByRole('combobox', { name: 'Search customers', exact: true });
  await search.fill(code);
  await page.getByRole('listbox', { name: 'Customers', exact: true }).getByRole('option', { name: code ? new RegExp(code, 'i') : 'All customers', exact: !code }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toContainText(code || 'All customers');
}
