import { test, expect, type Page } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'interaction specs run in the default project only');
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?test=1&scene=flat&props=testcube');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  return errors;
}

async function lock(page: Page): Promise<void> {
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__hero!.gameState!() === 'playing', undefined, { timeout: 10_000 });
}

const focused = (page: Page) => page.evaluate(() => window.__hero!.focusedId!());
const pos = (page: Page) => page.evaluate(() => window.__hero!.playerPos!());

test('focus at 2.0 m, not at 2.5 m', async ({ page }) => {
  const errors = await open(page);
  await lock(page);
  await page.evaluate(() => window.__hero!.placeTestCube!(2.0));
  await page.waitForFunction(() => window.__hero!.focusedId!() === 'testcube', undefined, { timeout: 5_000 });
  await page.evaluate(() => window.__hero!.placeTestCube!(2.5));
  await page.waitForFunction(() => window.__hero!.focusedId!() === null, undefined, { timeout: 5_000 });
  expect(await focused(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('inspect disables movement, Esc restores and does not open pause', async ({ page }) => {
  const errors = await open(page);
  await lock(page);
  await page.evaluate(() => window.__hero!.placeTestCube!(1.5));
  await page.waitForFunction(() => window.__hero!.focusedId!() === 'testcube', undefined, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__hero!.inspectOpen!() === true, undefined, { timeout: 5_000 });
  await page.waitForFunction(() => document.pointerLockElement === null, undefined, { timeout: 5_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/inspect-open.png' });

  const p0 = await pos(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(100);
  const p1 = await pos(page);
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.01);
  expect(await page.evaluate(() => window.__hero!.pauseOpen!())).toBe(false);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__hero!.inspectOpen!() === false, undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => window.__hero!.pauseOpen!())).toBe(false);
  expect(await page.evaluate(() => window.__hero!.gameState!())).toBe('playing');

  // Movement is back (the cube is straight ahead; walk away from it).
  const p2 = await pos(page);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(100);
  const p3 = await pos(page);
  expect(Math.hypot(p3.x - p2.x, p3.z - p2.z)).toBeGreaterThan(0.5);
  expect(await page.evaluate(() => window.__hero!.pauseOpen!())).toBe(false);
  expect(errors).toEqual([]);
});
