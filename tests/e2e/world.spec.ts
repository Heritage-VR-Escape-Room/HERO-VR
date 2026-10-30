import { test, expect, type Page } from '@playwright/test';
import en from '../../public/locales/en.json' with { type: 'json' };

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'world specs run in the default project only');
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?test=1&scene=garden');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 90_000 });
  return errors;
}

test('aerial view', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const density = await page.evaluate(() => window.__hero!.fogDensity!());
  await page.evaluate(() => window.__hero!.viewpoint!('aerial'));
  const f0 = await page.evaluate(() => window.__hero!.frames!());
  await page.waitForFunction((f) => window.__hero!.frames!() > f + 30, f0);
  const cam = await page.evaluate(() => window.__hero!.cameraPose!());
  expect(cam.y).toBeCloseTo(400, 0);
  expect(cam.lookY).toBeLessThan(-0.99); // looking straight down
  expect(await page.evaluate(() => window.__hero!.fogDebugBypass!())).toBe(true);
  // The debug view bypasses the fog; the fog itself is unchanged.
  expect(await page.evaluate(() => window.__hero!.fogDensity!())).toBe(density);
  await page.screenshot({ path: 'test-results/world-aerial.png' });

  await page.evaluate(() => window.__hero!.viewpoint!(null));
  expect(await page.evaluate(() => window.__hero!.fogDebugBypass!())).toBe(false);
  expect(errors).toEqual([]);
});

test('ground view from the plaza looking north', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  // The game starts on the wake bench; stand at the garden's own spawn, looking north.
  await page.evaluate(() => window.__hero!.teleport!(0, -150, 0));
  const p = await page.evaluate(() => window.__hero!.playerPos!());
  expect(p.x).toBeCloseTo(0, 1);
  expect(p.z).toBeCloseTo(-150, 1);
  expect(await page.evaluate(() => window.__hero!.playerYaw!())).toBe(0);
  await page.waitForTimeout(3000); // temporal fog settles
  await page.screenshot({ path: 'test-results/world-ground.png' });
  expect(errors).toEqual([]);
});

test('blocker', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  // 69 m due south of the plaza centre (on the tree-free axis-16 path), facing outward.
  await page.evaluate(() => window.__hero!.teleport!(0, -170 - 69, 180));
  await page.bringToFront();
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__hero!.gameState!() === 'playing', undefined, { timeout: 10_000 });

  let maxR = 0;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 30; i++) {
    const q = await page.evaluate(() => window.__hero!.playerPos!());
    maxR = Math.max(maxR, Math.hypot(q.x, q.z + 170));
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('KeyW');
  expect(maxR).toBeLessThanOrEqual(70);
  await expect(page.locator('#subtitle-text')).toHaveText(en['dlg.fritz_notyet']);
  const end = await page.evaluate(() => window.__hero!.playerPos!());
  expect(Math.hypot(end.x, end.z + 170)).toBeLessThan(70);
  expect(errors).toEqual([]);
});
