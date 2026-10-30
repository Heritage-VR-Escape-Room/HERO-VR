import { test, expect, type Page } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'Act 0 playthrough runs in the default project only');
});

const beats = (page: Page): Promise<string[]> => page.evaluate(() => window.__hero!.storyState!().firedBeats);

async function waitBeat(page: Page, id: string): Promise<void> {
  await page.waitForFunction((b) => window.__hero!.storyState!().firedBeats.includes(b), id, { timeout: 15_000 });
}

/** Pointer lock (playing); Chrome refuses it while the window is not in front, so retry the click. */
async function playing(page: Page): Promise<void> {
  if ((await page.evaluate(() => window.__hero!.gameState!())) === 'playing') return;
  await page.bringToFront();
  await expect.poll(async () => {
    await page.mouse.click(960, 540);
    return page.evaluate(() => window.__hero!.gameState!());
  }, { timeout: 20_000, intervals: [1500] }).toBe('playing');
}

/** Stand at (x, z), look along `yaw` / `pitch` and press E on `id`. */
async function use(page: Page, id: string, x: number, z: number, yaw: number, pitch: number): Promise<void> {
  await playing(page);
  await page.evaluate(([px, pz, y, p]) => window.__hero!.teleport!(px!, pz!, y!, p), [x, z, yaw, pitch]);
  await page.waitForFunction((i) => window.__hero!.focusedId!() === i, id, { timeout: 10_000 }).catch(async (e: Error) => {
    const why = await page.evaluate(() => ({ s: window.__hero!.gameState!(), f: window.__hero!.focusedId!(), c: window.__hero!.cameraPose!(), l: window.__hero!.lock!.state(), i: window.__hero!.inspectOpen!() }));
    throw new Error(`${id} not focused: ${JSON.stringify(why)} ${e.message}`);
  });
  await page.keyboard.press('KeyE');
}

test('New Game plays Act 0 to the end card', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__hero?.menuOpen?.() === true && (window.__hero.frames?.() ?? 0) > 5, undefined, { timeout: 120_000 });
  await page.click('#menu-new');
  await page.waitForFunction(() => (window.__hero?.playerPos?.() !== undefined) && (window.__hero.frames?.() ?? 0) > 30, undefined, { timeout: 120_000 });

  // The game world draws (a black frame compresses to a few KB).
  expect((await page.screenshot()).length).toBeGreaterThan(200_000);

  // b1: woke on the bench, looking at the pyramid.
  expect(await beats(page)).toEqual(['b1_wake']);
  const start = await page.evaluate(() => window.__hero!.playerPos!());
  expect(Math.hypot(start.x - 6, start.z + 150.3)).toBeLessThan(1);

  await playing(page);

  // b2 near the kiosk.
  await page.evaluate(() => window.__hero!.teleport!(-12, -160, 270));
  await waitBeat(page, 'b2_newsstand');

  // b4 on first use of the lock; Fritz flies to the tip.
  await use(page, 'cipher_lock', 0, -174.9, 0, -25);
  await waitBeat(page, 'b4_fritz_arrives');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__hero!.lock!.state().focused)).toBe(false);
  await page.waitForTimeout(1000); // the camera blends back from the lock view

  // b5 on the plaque.
  await use(page, 'plaque', 0, -173.8, 0, 22);
  await waitBeat(page, 'b5_latin_translation');
  await expect.poll(() => page.evaluate(() => window.__hero!.inspectOpen!())).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__hero!.inspectOpen!())).toBe(false);

  // The lock: KARL with the ring at 14.
  await page.evaluate(() => {
    const l = window.__hero!.lock!;
    l.rotate(14);
    l.setTumblers('KARL');
    l.pull();
  });
  await waitBeat(page, 'b7_opening');
  expect((await page.evaluate(() => window.__hero!.storyState!())).solvedPuzzles).toContain('cipher_lock');
  await expect.poll(() => page.evaluate(() => window.__hero!.lock!.state().doorOpen), { timeout: 15_000 }).toBe(true);

  // Alcove: jammer (fog unchanged), manifesto, part.
  const fog = await page.evaluate(() => window.__hero!.fogDensity!());
  await page.evaluate(() => window.__hero!.jammer!.disable());
  expect(await page.evaluate(() => window.__hero!.fogDensity!())).toBe(fog);
  await use(page, 'manifesto', 0.2, -174, 0, -60);
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); // close the document
  await page.waitForTimeout(500);
  await use(page, 'ticket_printer_part', -0.2, -174, 0, -60);
  await waitBeat(page, 'b9_hook');
  await expect.poll(() => page.evaluate(() => window.__hero!.storyState!().checkpointId), { timeout: 30_000 }).toBe('act0_end');
  await page.screenshot({ path: 'docs/screenshots/slice/act0-end.png' });
  expect(errors).toEqual([]);
});
