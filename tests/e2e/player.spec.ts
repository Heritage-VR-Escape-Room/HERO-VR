import { test, expect, type Page } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'player specs run in the default project only');
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?test=1&scene=flat');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  return errors;
}

async function lock(page: Page): Promise<void> {
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__hero!.gameState!() === 'playing', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe('game');
}

const pos = (page: Page) => page.evaluate(() => window.__hero!.playerPos!());

test('walks ~1.8 m in 1 s', async ({ page }) => {
  const errors = await open(page);
  await lock(page);
  const a = await pos(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(100); // let the last fixed step land
  const b = await pos(page);
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  expect(d).toBeGreaterThanOrEqual(1.6);
  expect(d).toBeLessThanOrEqual(2.0);
  const steps = await page.evaluate(() => window.__hero!.steps!());
  expect(steps.length).toBeGreaterThanOrEqual(2);
  expect(new Set(steps)).toEqual(new Set(['cobble']));
  await page.screenshot({ path: 'test-results/player-flat.png' });
  expect(errors).toEqual([]);
});

test('pointer lock loss pauses and freezes input', async ({ page }) => {
  const errors = await open(page);
  await lock(page);
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => window.__hero!.pauseOpen!() === true, undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => window.__hero!.gameState!())).toBe('paused');

  const p0 = await pos(page);
  const yaw0 = await page.evaluate(() => window.__hero!.playerYaw!());
  await page.mouse.move(200, 200);
  await page.mouse.move(1700, 900, { steps: 20 });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(100);
  const p1 = await pos(page);
  expect(p1.x).toBeCloseTo(p0.x, 3);
  expect(p1.y).toBeCloseTo(p0.y, 3);
  expect(p1.z).toBeCloseTo(p0.z, 3);
  expect(await page.evaluate(() => window.__hero!.playerYaw!())).toBe(yaw0);
  expect(errors).toEqual([]);
});
