import { test, expect, type Page } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'lock specs run in the default project only');
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?test=1&scene=flat&props=lock');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__hero!.gameState!() === 'playing', undefined, { timeout: 10_000 });
  return errors;
}

const st = (page: Page) => page.evaluate(() => window.__hero!.lock!.state());

async function focusLock(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hero!.focusedId!() === 'cipher_lock', undefined, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__hero!.lock!.state().ready, undefined, { timeout: 5_000 });
}

test('focus frees the cursor, ring turns, KARK rattles, KARL opens and saves', async ({ page }) => {
  const errors = await open(page);
  const yaw0 = await page.evaluate(() => window.__hero!.playerYaw!());
  await focusLock(page);
  await page.waitForFunction(() => document.pointerLockElement === null, undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => window.__hero!.pauseOpen!())).toBe(false);

  await page.keyboard.press('KeyD');
  await page.keyboard.press('KeyD');
  await page.keyboard.press('KeyA');
  expect((await st(page)).ringOffset).toBe(1);
  await page.evaluate(() => window.__hero!.lock!.rotate(13));
  expect((await st(page)).ringOffset).toBe(14);

  await page.evaluate(() => window.__hero!.lock!.setTumblers('KARK'));
  expect((await st(page)).tumblers).toBe('KARK');
  await page.evaluate(() => window.__hero!.lock!.pull());
  expect((await st(page)).shaking).toBe(true);
  await page.waitForFunction(() => !window.__hero!.lock!.state().shaking, undefined, { timeout: 5_000 });
  expect((await st(page)).solved).toBe(false);
  expect(await page.evaluate(() => window.__hero!.storyState!().solvedPuzzles)).not.toContain('cipher_lock');

  await page.evaluate(() => window.__hero!.lock!.setTumblers('KARL'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/lock-focused.png' });
  await page.evaluate(() => window.__hero!.lock!.pull());
  await page.waitForFunction(() => window.__hero!.lock!.state().solved, undefined, { timeout: 5_000 });
  const s = await page.evaluate(() => window.__hero!.storyState!());
  expect(s.solvedPuzzles).toContain('cipher_lock');
  expect(await page.evaluate(() => localStorage.getItem('som.save.v1'))).toContain('cipher_lock');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/lock-open.png' });

  // Focus ends by itself; the view returns to where the player was looking.
  await page.waitForFunction(() => !window.__hero!.lock!.state().focused, undefined, { timeout: 5_000 });
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__hero!.playerYaw!())).toBeCloseTo(yaw0, 3);
  expect(await page.evaluate(() => window.__hero!.focusedId!())).toBeNull();
  expect(errors).toEqual([]);
});

test('Esc leaves focus without pausing; a tumbler click cycles it', async ({ page }) => {
  const errors = await open(page);
  await focusLock(page);
  // Click the top half of tumbler 0 and the bottom half of tumbler 1.
  const pts = await page.evaluate(() => window.__hero!.lockTumblerPoints!());
  await page.mouse.click(pts[0]!.x, pts[0]!.top);
  await page.mouse.click(pts[1]!.x, pts[1]!.bottom);
  expect((await st(page)).tumblers).toBe('BZAA');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__hero!.lock!.state().focused, undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => window.__hero!.pauseOpen!())).toBe(false);
  expect(await page.evaluate(() => window.__hero!.gameState!())).toBe('playing');
  expect(errors).toEqual([]);
});
