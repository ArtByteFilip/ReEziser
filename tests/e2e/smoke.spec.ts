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

  // W walks the camera forward while held (nothing selected); one walk is one undo step.
  await page.keyboard.press('Escape');
  const camZ = () => page.evaluate(() => (window as any).__viewport.camera.position.z as number);
  const z0 = await camZ();
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.waitForTimeout(150);
  expect(await camZ()).toBeLessThan(z0 - 0.2);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  expect(await camZ()).toBeCloseTo(z0, 3);
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

test('filmmaker tools: cameras, framing, moves, guides, groups and export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const store = <T>(fn: string) => page.evaluate(`(${fn})(window.__store.getState())`) as Promise<T>;

  // Two people and a box.
  for (const shape of ['Person', 'Person', 'Box']) {
    await page.getByRole('button', { name: 'Add' }).click();
    await page.locator('.shape-tile', { hasText: shape }).click();
  }

  // Group the two people with Ctrl+G; picking one then picks both.
  await page.evaluate(() => {
    const s = (window as any).__store.getState();
    s.select([s.project.objects[0].id, s.project.objects[1].id]);
  });
  await page.keyboard.press('Control+g');
  expect(await store<number>('s => s.project.groups.length')).toBe(1);
  await page.evaluate(() => {
    const s = (window as any).__store.getState();
    s.select([s.project.objects[0].id]);
  });
  expect(await store<number>('s => s.selection.length')).toBe(2);
  await expect(page.locator('.context-panel .panel-title')).toHaveText('Group 1');
  await page.keyboard.press('Control+Shift+g');
  expect(await store<unknown>('s => s.project.groups')).toBeUndefined();

  // Frame the first person as a close-up from the object panel.
  await page.evaluate(() => {
    const s = (window as any).__store.getState();
    s.select([s.project.objects[0].id]);
  });
  await page.locator('.context-panel button', { hasText: 'Frame' }).click();
  await page.locator('.context-panel .chip', { hasText: /^Close-up$/ }).click();
  expect(await store<string>('s => s.project.shots[0].shotType')).toBe('close-up');
  await expect(page.locator('.shot-card .shot-type')).toHaveText('CU');

  // A dolly in, then a new shot on a second camera.
  await page.getByRole('tab', { name: 'Move' }).click();
  await page.locator('.context-panel .chip', { hasText: 'Dolly' }).click();
  expect(await store<string>('s => s.project.shots[0].cameraMove')).toBe('dolly-in');
  await page.keyboard.press('n');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('.shape-tile', { hasText: 'Camera' }).click();
  expect(await store<number>('s => s.project.cameras.length')).toBe(2);
  expect(await store<boolean>('s => s.project.shots[1].cameraId !== s.project.shots[0].cameraId')).toBe(true);

  // Camera view chips and guides.
  await page.keyboard.press('Tab');
  await page.locator('.cam-chip[title="Frame guides"]').click();
  await page.locator('.toggle', { hasText: 'Rule of thirds' }).click();
  await expect(page.locator('.guide-thirds')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  // The viewport swaps render cameras in an effect; project through the Director camera.
  await page.waitForFunction(() => (window as any).__viewport.camera?.name === 'director');

  // Short right click on the box opens the radial menu.
  await page.evaluate(() => {
    const s = (window as any).__store.getState();
    s.select([s.project.objects[2].id]);
  });
  const box = await page.evaluate(() => {
    const w = window as any;
    const s = w.__store.getState();
    const st = s.project.objects[2].base;
    const cam = w.__viewport.camera;
    const v = new cam.position.constructor(st.position[0], 0.5, st.position[2]).project(cam);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  await page.mouse.click(box.x, box.y, { button: 'right' });
  await expect(page.locator('.radial-item')).toHaveCount(5);
  await page.locator('.radial-item', { hasText: 'Duplicate' }).click();
  expect(await store<number>('s => s.project.objects.length')).toBe(4);

  // Ctrl + diagonal drag moves the box (or its copy on top of it) along one floor axis only.
  await page.keyboard.press('Escape');
  const positions = () =>
    store<number[][]>(
      's => s.project.objects.map((o) => s.project.shots[s.shotIndex].objectTracks[o.id]?.[0].value.position ?? o.base.position)',
    );
  const before = await positions();
  await page.keyboard.down('Control');
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 15, { steps: 6 });
  await page.mouse.move(box.x + 120, box.y + 70, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  const after = await positions();
  const changed = after.map((p, i) => [Math.abs(p[0] - before[i][0]) > 0.2, Math.abs(p[2] - before[i][2]) > 0.2]);
  const movedObjects = changed.filter(([x, z]) => x || z);
  expect(movedObjects).toHaveLength(1);
  expect(movedObjects[0].filter(Boolean)).toHaveLength(1);

  // Shot list export (the save dialog is stubbed to capture the file).
  await page.evaluate(() => {
    const w = window as any;
    w.__saved = [];
    w.showSaveFilePicker = async (opts: { suggestedName: string }) => ({
      createWritable: async () => ({
        write: async (d: Blob) => w.__saved.push({ name: opts.suggestedName, text: await d.text() }),
        close: async () => {},
      }),
    });
  });
  await page.keyboard.press('Control+e');
  await page.locator('.export-kind', { hasText: 'Shot list' }).click();
  await page.locator('.primary-btn').click();
  await page.waitForFunction(() => (window as any).__saved.length === 1);
  const saved = await page.evaluate(() => (window as any).__saved[0]);
  expect(saved.name).toBe('Untitled scene shot list.csv');
  expect(saved.text).toContain('1,Shot 1,Cam A,');
  expect(saved.text).toContain('Close-up');

  expect(errors).toEqual([]);
});

test('fast motion: timeline steps, split, drawn path, take and music', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const store = <T>(fn: string) => page.evaluate(`(${fn})(window.__store.getState())`) as Promise<T>;

  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('.shape-tile', { hasText: 'Person' }).click();

  // Timeline: drag the playhead into the shot, then move the person: a middle step appears.
  await page.locator('.timeline-toggle').click();
  await expect(page.locator('.timeline')).toBeVisible();
  const ruler = (await page.locator('.tl-ruler').boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width * 0.5, ruler.y + ruler.height / 2);
  expect(await store<number>('s => s.phase')).toBeCloseTo(0.5, 1);
  await page.evaluate(() => {
    const s = (window as any).__store.getState();
    const o = s.project.objects[0];
    s.setObjectStates({ [o.id]: { ...o.base, position: [2, 0, 0] } });
  });
  expect(await store<number>('s => s.project.shots[0].objectTracks[s.project.objects[0].id].length')).toBe(3);
  await expect(page.locator('.tl-key')).toHaveCount(3);

  // Change how the first stretch moves.
  await page.locator('.tl-seg.moving').first().click();
  await page.locator('.easing-menu .menu-item', { hasText: 'Linear' }).click();
  expect(await store<string>('s => s.project.shots[0].objectTracks[s.project.objects[0].id][0].easing')).toBe('linear');

  // Split at the playhead.
  await page.locator('.timeline button', { hasText: 'Split here' }).click();
  await expect(page.locator('.shot-card')).toHaveCount(2);
  expect(await store<number[]>('s => s.project.shots.map((x) => x.duration)')).toEqual([1.5, 1.5]);

  // Draw a path for the person in the second shot.
  await page.locator('.timeline-toggle').click();
  await page.evaluate(() => {
    const s = (window as any).__store.getState();
    s.select([s.project.objects[0].id]);
  });
  await page.locator('.context-panel button', { hasText: 'Draw path' }).click();
  await page.mouse.move(600, 500);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(600 + i * 20, 500 - Math.sin(i / 3) * 40);
  await page.mouse.up();
  expect(await store<number>('s => s.project.shots[1].objectTracks[s.project.objects[0].id].length')).toBeGreaterThan(2);

  // Record a take: press, drag, let go.
  await page.locator('.context-panel button', { hasText: 'Record' }).click();
  await expect(page.locator('.take-overlay')).toBeVisible();
  await page.mouse.move(700, 450);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(700 + i * 15, 450);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await expect(page.locator('.take-overlay')).toHaveCount(0);
  const takeKeys = await store<number[]>('s => s.project.shots[1].objectTracks[s.project.objects[0].id].map((k) => k.t)');
  expect(takeKeys[0]).toBe(0);
  expect(takeKeys[takeKeys.length - 1]).toBe(1);

  // Music: beats found, waveform under each card.
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Add music…' }).click();
  await (await chooser).setFiles('tests/e2e/fixtures/beat120.wav');
  await page.waitForFunction(() => !!(window as any).__store.getState().project.audio);
  // A click every half second for 4 s.
  expect(await store<number>('s => s.project.audio.beats.length')).toBeGreaterThanOrEqual(6);
  await expect(page.locator('canvas.waveform')).toHaveCount(2);

  expect(errors).toEqual([]);
});
