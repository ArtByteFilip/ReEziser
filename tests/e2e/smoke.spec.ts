import { expect, test } from '@playwright/test';

type StoreHandle = { getState(): any };
const state = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __store: StoreHandle }).__store.getState();
    return {
      objects: s.project.objects.length,
      shots: s.project.shots.length,
      selection: s.selection.length,
      viewMode: s.viewMode,
      playing: !!s.playback,
      canUndo: s.canUndo,
    };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('builds a two-shot scene and plays it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await expect(page.getByText('Untitled scene')).toBeVisible();
  await expect(page.locator('.shot-card')).toHaveCount(1);

  // Add a person and a box through the single add button.
  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('.shape-tile', { hasText: 'Person' }).click();
  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('.shape-tile', { hasText: 'Box' }).click();
  expect((await state(page)).objects).toBe(2);
  await expect(page.locator('.context-panel')).toBeVisible();

  // Undo removes the box, redo brings it back.
  await page.keyboard.press('Control+z');
  expect((await state(page)).objects).toBe(1);
  await page.keyboard.press('Control+Shift+z');
  expect((await state(page)).objects).toBe(2);

  // New shot and view switch from the keyboard.
  await page.keyboard.press('n');
  await expect(page.locator('.shot-card')).toHaveCount(2);
  await page.keyboard.press('Tab');
  expect((await state(page)).viewMode).toBe('camera');
  await expect(page.locator('.lens-chip')).toBeVisible();
  await page.keyboard.press('Tab');

  // Play hides the editing UI; Escape stops.
  await page.getByRole('button', { name: 'Play' }).click();
  expect((await state(page)).playing).toBe(true);
  await expect(page.locator('.shot-card')).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect((await state(page)).playing).toBe(false);

  // Thumbnails render for every shot.
  await expect(page.locator('.shot-card img')).toHaveCount(2, { timeout: 10_000 });

  expect(errors).toEqual([]);
});
