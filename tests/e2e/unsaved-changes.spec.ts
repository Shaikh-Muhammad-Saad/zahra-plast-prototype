import { test, expect, type Locator, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import type { AppState } from '../../src/types';

async function savedDocuments(page: Page): Promise<AppState['documents']> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('zahra-plast-local', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      request.onsuccess = () => { db.close(); resolve(request.result.documents); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }));
}

async function scrollToBottom(editor: Locator) {
  const content = editor.locator('.modal-content');
  await content.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeGreaterThan(50);
}

async function expectNoticeInView(editor: Locator) {
  const notice = editor.getByRole('region', { name: 'You have unsaved changes', exact: true });
  await expect(notice.getByRole('alert')).toContainText('You have unsaved changes');
  await expect(notice.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await expect.poll(() => notice.evaluate(element => {
    const panel = element.getBoundingClientRect();
    const body = element.closest('.modal-content')!.getBoundingClientRect();
    return panel.top >= body.top && panel.bottom <= body.bottom + 1 &&
      panel.left >= body.left && panel.right <= body.right + 1;
  })).toBe(true);
  await expect(editor).toHaveAttribute('data-state', 'open');
  return notice;
}

for (const scenario of [
  { kind: 'Invoice', route: '/invoices', width: 1440, height: 800, motion: 'no-preference' as const },
  { kind: 'Quote', route: '/quotes', width: 375, height: 812, motion: 'reduce' as const },
]) {
  test(scenario.kind + ' warns in view on every close attempt and preserves the saved draft when changes are discarded', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ reducedMotion: scenario.motion });
    await login(page);
    const before = await savedDocuments(page);
    const document = before.filter(item => item.kind === scenario.kind && item.status === 'Draft')
      .sort((first, second) => second.lines.length - first.lines.length)[0];
    expect(document.lines.length).toBeGreaterThanOrEqual(6);
    await page.goto(scenario.route + '?document=' + encodeURIComponent(document.id));
    await page.getByRole('dialog', { name: document.number, exact: true }).getByRole('button', { name: 'Edit draft', exact: true }).click();
    const editor = page.getByRole('dialog', { name: document.number, exact: true });
    const quantity = editor.getByRole('spinbutton', { name: 'Quantity for ' + document.lines[0].productName, exact: true });
    const notes = editor.getByRole('textbox', { name: /^Document notes/ });
    const unsavedQuantity = String(document.lines[0].quantity + 3);
    const unsavedNotes = 'Keep my ' + scenario.kind.toLowerCase() + ' notes until I choose to discard.';
    await quantity.fill(unsavedQuantity);
    await notes.fill(unsavedNotes);

    // Repeat while the notice is already mounted, as well as after Keep editing.
    for (const action of ['close', 'cancel', 'escape', 'backdrop']) {
      await scrollToBottom(editor);
      if (action === 'close') await editor.getByRole('button', { name: 'Close dialog', exact: true }).click();
      else if (action === 'cancel') await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
      else if (action === 'escape') await page.keyboard.press('Escape');
      else await page.mouse.click(4, 4);
      const notice = await expectNoticeInView(editor);
      await expect(notes).toHaveValue(unsavedNotes);
      await expect(quantity).toHaveValue(unsavedQuantity);
      if (action === 'cancel') {
        await notice.getByRole('button', { name: 'Keep editing', exact: true }).click();
        await expect(notice).toHaveCount(0);
        await expect(notes).toHaveValue(unsavedNotes);
        await expect(quantity).toHaveValue(unsavedQuantity);
      }
    }
    const notice = await expectNoticeInView(editor);
    await page.screenshot({ path: 'tmp/qa/unsaved-changes-' + scenario.kind.toLowerCase() + '-' + scenario.width + '.png', animations: 'disabled' });
    await notice.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Edit draft', exact: true })).toBeVisible();
    expect(await savedDocuments(page)).toEqual(before);

    // The original data reopens intact, and an unchanged draft still closes directly.
    await editor.getByRole('button', { name: 'Edit draft', exact: true }).click();
    await expect(notes).toHaveValue(document.notes);
    await expect(quantity).toHaveValue(String(document.lines[0].quantity));
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Edit draft', exact: true })).toBeVisible();
    await expect(editor.getByRole('region', { name: 'You have unsaved changes', exact: true })).toHaveCount(0);
    expect(await savedDocuments(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}
