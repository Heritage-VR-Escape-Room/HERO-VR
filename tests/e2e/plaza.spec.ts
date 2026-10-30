import { test, expect, type Page } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'plaza specs run in the default project only');
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto('/?test=1&scene=garden');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 30, undefined, { timeout: 90_000 });
  return errors;
}

test('all perches and viewpoints exist', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const perches = await page.evaluate(() => window.__hero!.fritz!.perches!());
  // Plus the dynamic 'intro' / 'follow' spots once Fritz has met the player.
  expect(perches).toEqual(expect.arrayContaining(['bench_back', 'kiosk_roof', 'lamp_3', 'pyramid_tip']));
  for (const id of ['pyramid_tip', 'lamp_3']) {
    await page.evaluate((p) => window.__hero!.fritz!.flyTo(p), id);
    expect(await page.evaluate(() => window.__hero!.fritz!.perch())).toBe(id);
  }
  const names = ['wake', 'pyramid', 'plaque', 'lock', 'kiosk', 'wide', 'menu_orbit'];
  for (const n of names) expect(await page.evaluate((v) => window.__hero!.viewpoint!(v), n), n).toBe(true);
  // The plaque viewpoint looks at the pyramid's south face from the south.
  await page.evaluate(() => window.__hero!.viewpoint!('plaque'));
  const f0 = await page.evaluate(() => window.__hero!.frames!());
  await page.waitForFunction((f) => window.__hero!.frames!() > f + 5, f0);
  const cam = await page.evaluate(() => window.__hero!.cameraPose!());
  expect(cam.z).toBeLessThan(-173);
  expect(cam.lookZ).toBeGreaterThan(0.5);
  await page.evaluate(() => window.__hero!.viewpoint!(null));

  // The fog scatters only a capped set of nearby lights, every lamp's halo among them.
  const fogLights = await page.evaluate(() => window.__hero!.fogLightCount!());
  expect(fogLights).toBeGreaterThanOrEqual(8);
  expect(fogLights).toBeLessThanOrEqual(12);

  // The circuit panel is the active puzzle within 6 m of it, not from the far side of the plaza.
  await page.evaluate(() => window.__hero!.teleport!(-1.45, -177, 0));
  await page.waitForFunction(() => window.__hero!.activePuzzle!() === 'circuit_bridge');
  await page.evaluate(() => window.__hero!.teleport!(0, -150, 0));
  await page.waitForFunction(() => window.__hero!.activePuzzle!() === null);
  expect(errors).toEqual([]);
});

test('disabling jammer leaves __hero.fogDensity() unchanged', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const density = await page.evaluate(() => window.__hero!.fogDensity!());
  expect(await page.evaluate(() => window.__hero!.jammer!.state())).toEqual({ light: true, hum: true, vent: true });
  // The jammer sits behind the closed brass door: not reachable until the lock is solved.
  await page.evaluate(() => window.__hero!.teleport!(0, -174.4, 0));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__hero!.focusedId!())).not.toBe('jammer');

  await page.evaluate(() => window.__hero!.jammer!.disable());
  expect(await page.evaluate(() => window.__hero!.jammer!.state())).toEqual({ light: false, hum: false, vent: false });
  expect(await page.evaluate(() => window.__hero!.storyState!().disabledObjects)).toContain('jammer');
  const f0 = await page.evaluate(() => window.__hero!.frames!());
  await page.waitForFunction((f) => window.__hero!.frames!() > f + 30, f0);
  expect(await page.evaluate(() => window.__hero!.fogDensity!())).toBe(density);
  expect(errors).toEqual([]);
});

test('plaque texture re-renders in Arabic', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await page.waitForFunction(() => window.__hero!.plaqueLocale!() === 'en', undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__hero!.setLocale!('ar'));
  await page.waitForFunction(() => window.__hero!.plaqueLocale!() === 'ar', undefined, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
