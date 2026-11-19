import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';

// Inspect the real transition at its midpoint, then finish it. This verifies
// visible motion without depending on how quickly the test machine renders.
function nextMotion(page: Page, state: 'open' | 'closing') {
  return page.evaluate(expectedState => new Promise<{
    opacity: number;
    transform: string;
    duration: number;
    open: boolean;
    title: string;
    content: string;
    footer: string;
    values: string[];
  }>(resolve => {
    const onTransition = (event: TransitionEvent) => {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement) || event.pseudoElement || event.propertyName !== 'opacity' || dialog.dataset.state !== expectedState) return;
      document.removeEventListener('transitionrun', onTransition);
      const animations = dialog.getAnimations().filter(animation => {
        const effect = animation.effect as KeyframeEffect | null;
        return effect?.target === dialog && !effect.pseudoElement;
      });
      const durations = animations.map(animation => Number(animation.effect!.getTiming().duration));
      animations.forEach((animation, index) => {
        animation.pause();
        animation.currentTime = durations[index] / 2;
      });
      const style = getComputedStyle(dialog);
      const snapshot = {
        opacity: Number(style.opacity),
        transform: style.transform,
        duration: Math.max(...durations),
        open: dialog.open,
        title: dialog.querySelector('h2')?.textContent ?? '',
        content: dialog.querySelector('.modal-content')?.textContent ?? '',
        footer: dialog.querySelector('.modal-footer')?.textContent ?? '',
        values: Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'), input => input.value),
      };
      animations.forEach(animation => animation.finish());
      resolve(snapshot);
    };
    document.addEventListener('transitionrun', onTransition);
  }), state);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await login(page);
});

test('product details animate in and retain their content through exit before restoring focus', async ({ page }) => {
  await page.goto('/products');
  const trigger = page.getByRole('button', { name: /^View / }).first();
  const productName = (await trigger.getAttribute('aria-label'))!.replace(/^View /, '');
  const opening = nextMotion(page, 'open');
  await trigger.click();
  const entry = await opening;
  expect(entry.open).toBe(true);
  expect(entry.title).toBe(productName);
  expect(entry.opacity).toBeGreaterThan(0);
  expect(entry.opacity).toBeLessThan(1);
  expect(entry.transform).not.toBe('none');
  expect(entry.duration).toBeGreaterThan(0);
  const dialog = page.getByRole('dialog', { name: productName, exact: true });
  const closing = nextMotion(page, 'closing');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const exit = await closing;
  expect(exit.open).toBe(true);
  expect(exit.title).toBe(productName);
  expect(exit.content).toContain('Cost price');
  expect(exit.footer).toContain('Edit product');
  expect(exit.opacity).toBeGreaterThan(0);
  expect(exit.opacity).toBeLessThan(1);
  expect(exit.duration).toBeLessThan(entry.duration);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('Escape and backdrop close forms, and reopening starts with fresh fields', async ({ page }) => {
  await page.goto('/customers');
  const trigger = page.getByRole('button', { name: 'Add customer', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Add a customer', exact: true });
  await dialog.getByLabel('Business name', { exact: true }).fill('Unsaved modal example');
  const closing = nextMotion(page, 'closing');
  await page.keyboard.press('Escape');
  expect((await closing).values).toContain('Unsaved modal example');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel('Business name', { exact: true })).toHaveValue('');
  await page.mouse.click(8, 8);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // A close requested immediately after opening must not leave a stuck dialog.
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await trigger.click();
  await expect(dialog.getByLabel('Business name', { exact: true })).toHaveValue('');
});

test('product details can hand off to the editor without losing focus, fields, or the photo', async ({ page }) => {
  await page.goto('/products');
  const trigger = page.getByRole('button', { name: /^View / }).first();
  const productName = (await trigger.getAttribute('aria-label'))!.replace(/^View /, '');
  await trigger.click();
  const details = page.getByRole('dialog', { name: productName, exact: true });
  const imageSource = await details.locator('.product-detail-hero img').getAttribute('src');
  await details.getByRole('button', { name: 'Edit product', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit product', exact: true });
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(editor).toBeVisible();
  expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await expect(editor.getByLabel('Product name', { exact: true })).toHaveValue(productName);
  const image = editor.locator('.product-image-field-preview img');
  await expect(image).toHaveAttribute('src', imageSource!);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('an invoice with unsaved changes stays open until discard is confirmed', async ({ page }) => {
  await page.goto('/invoices?new=1');
  const dialog = page.getByRole('dialog', { name: 'New invoice', exact: true });
  const notes = dialog.getByRole('textbox', { name: /^Document notes/ });
  await notes.fill('Keep these notes until discard is confirmed.');
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('You have unsaved changes', { exact: true })).toBeVisible();
  await expect(dialog).toHaveAttribute('data-state', 'open');
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(notes).toHaveValue('Keep these notes until discard is confirmed.');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const closing = nextMotion(page, 'closing');
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  const exit = await closing;
  expect(exit.title).toBe('New invoice');
  expect(exit.values).toContain('Keep these notes until discard is confirmed.');
  expect(exit.open).toBe(true);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New invoice', exact: true })).toBeVisible();
});

test('reduced motion skips transitions and the product form fits a narrow viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/products');
  const trigger = page.getByRole('button', { name: 'Add product', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Add a new product', exact: true });
  await expect(dialog).toBeVisible();
  const presentation = await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
      transitionDuration: getComputedStyle(element).transitionDuration,
      opacity: getComputedStyle(element).opacity,
      transform: getComputedStyle(element).transform,
    };
  });
  expect(presentation.x).toBeGreaterThanOrEqual(0);
  expect(presentation.y).toBeGreaterThanOrEqual(0);
  expect(presentation.right).toBeLessThanOrEqual(375);
  expect(presentation.bottom).toBeLessThanOrEqual(812);
  expect(presentation.opacity).toBe('1');
  expect(presentation.transform).toBe('none');
  expect(presentation.transitionDuration.split(',').every(duration => parseFloat(duration) <= 0.00001)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
