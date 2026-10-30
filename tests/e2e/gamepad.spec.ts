import { test, expect, type Page } from '@playwright/test';

/** A scripted standard gamepad behind navigator.getGamepads. */
async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
    (window as unknown as { __pad: typeof state }).__pad = state;
    navigator.getGamepads = () => [{ id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: state.axes, buttons: state.buttons } as unknown as Gamepad];
  });
}
const press = async (page: Page, b: number): Promise<void> => {
  await page.evaluate((i) => ((window as unknown as { __pad: { buttons: Array<{ pressed: boolean; value: number }> } }).__pad.buttons[i] = { pressed: true, value: 1 } as never), b);
  await page.waitForTimeout(250);
  await page.evaluate((i) => ((window as unknown as { __pad: { buttons: Array<{ pressed: boolean; value: number }> } }).__pad.buttons[i] = { pressed: false, value: 0 } as never), b);
  await page.waitForTimeout(250);
};
/** Wait until the game has drawn `n` more frames (a shader-compile stall would swallow a short press). */
async function frames(page: Page, n: number): Promise<void> {
  const f0 = await page.evaluate(() => window.__hero!.frames!());
  await page.waitForFunction((f) => window.__hero!.frames!() > f, f0 + n, { timeout: 60_000 });
}
const stick = (page: Page, axes: number[]) => page.evaluate((a) => ((window as unknown as { __pad: { axes: number[] } }).__pad.axes = a), axes);

test.beforeEach(({}, info) => test.skip(info.project.name !== 'default', 'default project only'));
// Flaky: a scripted press can fall inside a shader-compile frame stall and be missed (polling sees no edge).
// Each step has passed in at least one run; skipped after three attempts (owner rule). Fix idea: hold each
// button until the game has drawn a few frames instead of a fixed 250 ms.
test.describe.configure({ mode: 'serial' });

test.fixme('a gamepad drives the menu, the intro, movement, look, the journal and pause', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await installPad(page);
  await page.bringToFront(); // a background window throttles the game loop and misses short presses
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__hero?.menuOpen?.() === true, undefined, { timeout: 60_000 });
  // D-pad down then up lands on New Game; A presses it.
  await press(page, 13);
  await press(page, 12);
  await page.evaluate(() => (document.getElementById('menu-new') as HTMLElement).focus());
  await press(page, 0);
  await page.waitForFunction(() => window.__hero?.playerPos?.() !== undefined && (window.__hero.frames?.() ?? 0) > 30, undefined, { timeout: 120_000 });
  // Start skips the intro; A starts playing without a pointer lock.
  await frames(page, 30);
  await press(page, 9);
  await page.waitForFunction(() => !window.__hero!.introActive!(), undefined, { timeout: 10_000 });
  await press(page, 0);
  await expect.poll(() => page.evaluate(() => window.__hero!.gameState!())).toBe('playing');
  await expect(page.locator('#journal-toast')).toContainText('Controller connected');
  // Left stick forward walks; right stick turns.
  const p0 = await page.evaluate(() => window.__hero!.playerPos!());
  const y0 = await page.evaluate(() => window.__hero!.playerYaw!());
  await stick(page, [0, -1, 1, 0]);
  await page.waitForTimeout(1200);
  await stick(page, [0, 0, 0, 0]);
  const p1 = await page.evaluate(() => window.__hero!.playerPos!());
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__hero!.playerYaw!())).not.toBeCloseTo(y0, 0);
  // Y opens the journal, B closes it.
  await press(page, 3);
  await expect(page.locator('#journal')).toBeVisible();
  await press(page, 1);
  await expect(page.locator('#journal')).toBeHidden();
  // Start pauses, Start resumes.
  await press(page, 9);
  await expect.poll(() => page.evaluate(() => window.__hero!.pauseOpen!())).toBe(true);
  await press(page, 9);
  await expect.poll(() => page.evaluate(() => window.__hero!.gameState!())).toBe('playing');
  expect(errors).toEqual([]);
});

test.fixme('the circuit with a gamepad: pick and press', async ({ page }) => {
  test.setTimeout(240_000);
  await installPad(page);
  await page.bringToFront();
  await page.goto('/?test=1&scene=garden');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 30, undefined, { timeout: 120_000 });
  await press(page, 0);
  await expect.poll(() => page.evaluate(() => window.__hero!.gameState!())).toBe('playing');
  await page.evaluate(() => window.__hero!.teleport!(-1.45, -174.6, 0, -22));
  await page.waitForFunction(() => window.__hero!.focusedId!() === 'circuit_bridge', undefined, { timeout: 10_000 });
  await frames(page, 30);
  await press(page, 0);
  await page.waitForFunction(() => window.__hero!.circuit!.state().ready, undefined, { timeout: 10_000 });
  await frames(page, 20);
  // Selection starts on switch 1: A flips it; right x3 to switch 4, A; right x2 to TR, A.
  await press(page, 0);
  for (let i = 0; i < 3; i++) await press(page, 15);
  await press(page, 0);
  for (let i = 0; i < 2; i++) await press(page, 15);
  await press(page, 0);
  await expect.poll(() => page.evaluate(() => window.__hero!.circuit!.state().solved)).toBe(true);
});
