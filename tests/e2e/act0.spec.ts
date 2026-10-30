import { test, expect, type Page } from '@playwright/test';
import en from '../../public/locales/en.json' with { type: 'json' };

/**
 * Act 0 from the main menu to the end card. Interact and hint use real key
 * presses; the hooks only teleport, set the game clock and turn the lock.
 */

const beats = (page: Page): Promise<string[]> => page.evaluate(() => window.__hero!.storyState!().firedBeats);
const subtitle = (page: Page): Promise<string> => page.locator('#subtitle-text').innerText();

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
    const why = await page.evaluate(() => ({ s: window.__hero!.gameState!(), f: window.__hero!.focusedId!(), c: window.__hero!.cameraPose!() }));
    throw new Error(`${id} not focused: ${JSON.stringify(why)} ${e.message}`);
  });
  await page.keyboard.press('KeyE');
}

/** Main menu -> New Game (or Continue) -> the plaza drawing. */
async function enter(page: Page, button: 'new' | 'continue', lang = 'en'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?test=1&lang=${lang}`);
  await page.waitForFunction(() => window.__hero?.menuOpen?.() === true, undefined, { timeout: 60_000 });
  await page.click(`#menu-${button}`);
  await page.waitForFunction(() => window.__hero?.playerPos?.() !== undefined && (window.__hero.frames?.() ?? 0) > 30, undefined, { timeout: 120_000 });
  return errors;
}

async function shot(page: Page, lang: string, name: string): Promise<void> {
  if (lang !== 'en') await page.screenshot({ path: `docs/screenshots/slice/act0-${lang}-${name}.png` });
}

/** From waking up to the door opening. */
async function playToOpenDoor(page: Page, lang: string, hints: boolean): Promise<void> {
  // The game world draws (a black frame compresses to a few KB).
  expect((await page.screenshot()).length).toBeGreaterThan(200_000);

  // b1: woke on the bench, looking at the pyramid.
  expect(await beats(page)).toEqual(['b1_wake']);
  const start = await page.evaluate(() => window.__hero!.playerPos!());
  expect(Math.hypot(start.x - 6, start.z + 150.3)).toBeLessThan(1);
  await expect.poll(() => subtitle(page)).not.toBe('');
  await shot(page, lang, 'b1');
  await playing(page);

  // b2 near the kiosk.
  await page.evaluate(() => window.__hero!.teleport!(-12, -160, 270));
  await waitBeat(page, 'b2_newsstand');
  await page.waitForTimeout(400);
  await shot(page, lang, 'b2');

  // b4 on first use of the lock; Fritz flies to the tip.
  await use(page, 'cipher_lock', 0, -174.9, 0, -25);
  await waitBeat(page, 'b4_fritz_arrives');
  await page.waitForTimeout(400);
  await shot(page, lang, 'b4');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__hero!.lock!.state().focused)).toBe(false);
  await page.waitForTimeout(1000); // the camera blends back from the lock view

  // b5 on the plaque; the inspect view shows the translation.
  await use(page, 'plaque', 0, -173.8, 0, 22);
  await waitBeat(page, 'b5_latin_translation');
  await expect.poll(() => page.evaluate(() => window.__hero!.inspectOpen!())).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, lang, 'b5');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__hero!.inspectOpen!())).toBe(false);

  if (hints) {
    // H four times, 46 s of game time apart: the four tiers in order.
    await page.evaluate(() => window.__hero!.teleport!(0, -175.5, 0));
    await playing(page);
    for (let i = 1; i <= 4; i++) {
      await page.evaluate((t) => window.__hero!.setClock!(t), 1000 + i * 46);
      await page.keyboard.press('KeyH');
      await expect.poll(() => subtitle(page)).toContain((en as Record<string, string>)[`hint.lock.${i}`]!);
    }
    await page.evaluate(() => window.__hero!.setClock!(null));
  }

  // The lock: KARL with the ring at 14.
  await page.evaluate(() => {
    const l = window.__hero!.lock!;
    l.rotate(14);
    l.setTumblers('KARL');
    l.pull();
  });
  await waitBeat(page, 'b7_opening');
  expect((await page.evaluate(() => window.__hero!.storyState!())).solvedPuzzles).toContain('cipher_lock');
  expect(await page.evaluate(() => localStorage.getItem('som.save.v1'))).toContain('cipher_lock');
  await expect.poll(() => page.evaluate(() => window.__hero!.lock!.state().doorOpen), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, lang, 'b7');
}

async function finishAlcove(page: Page, lang: string): Promise<void> {
  const fog = await page.evaluate(() => window.__hero!.fogDensity!());
  await page.evaluate(() => window.__hero!.jammer!.disable());
  expect(await page.evaluate(() => window.__hero!.fogDensity!())).toBe(fog);
  await use(page, 'manifesto', 0.2, -174, 0, -60);
  await page.waitForTimeout(600);
  await shot(page, lang, 'manifesto');
  await page.keyboard.press('Escape'); // close the document
  await page.waitForTimeout(500);
  await use(page, 'ticket_printer_part', -0.2, -174, 0, -60);
  await waitBeat(page, 'b9_hook');
  await page.waitForTimeout(400);
  await shot(page, lang, 'b9');
  await expect.poll(() => page.evaluate(() => window.__hero!.storyState!().checkpointId), { timeout: 30_000 }).toBe('act0_end');
  await expect(page.locator('#end-card')).toBeVisible();
}

for (const lang of ['en', 'ar', 'de']) {
  test(`full playthrough ${lang}`, async ({ page }, info) => {
    // WebGL2 (no-webgpu project) runs the English playthrough only.
    test.skip(info.project.name !== 'default' && lang !== 'en', 'translations run on WebGPU only');
    test.setTimeout(300_000);
    const errors = await enter(page, 'new', lang);
    await playToOpenDoor(page, lang, lang === 'en');
    await finishAlcove(page, lang);
    if (lang === 'en' && info.project.name === 'default') await page.screenshot({ path: 'docs/screenshots/slice/act0-end.png' });
    expect(errors).toEqual([]);
  });
}

test('wrong code does not solve', async ({ page }, info) => {
  test.skip(info.project.name !== 'default', 'default project only');
  test.setTimeout(180_000);
  const errors = await enter(page, 'new');
  await page.evaluate(() => {
    const l = window.__hero!.lock!;
    l.rotate(14);
    l.setTumblers('KARK');
    l.pull();
  });
  await page.waitForTimeout(2000);
  expect((await page.evaluate(() => window.__hero!.lock!.state())).solved).toBe(false);
  expect((await page.evaluate(() => window.__hero!.storyState!())).solvedPuzzles).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('som.save.v1'))).toBeNull();
  expect(errors).toEqual([]);
});

test('resume after lock', async ({ page }, info) => {
  test.skip(info.project.name !== 'default', 'default project only');
  test.setTimeout(300_000);
  await enter(page, 'new');
  await playToOpenDoor(page, 'en', false);

  // Reload, Continue: door open, jammer still on, no item, no replayed lines.
  const errors = await enter(page, 'continue');
  const st = await page.evaluate(() => window.__hero!.lock!.state());
  expect(st.solved).toBe(true);
  expect(st.doorOpen).toBe(true);
  expect(await page.evaluate(() => window.__hero!.jammer!.state())).not.toBe('disabled');
  expect(await page.evaluate(() => window.__hero!.inventory!())).toEqual([]);
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    expect(await subtitle(page).catch(() => '')).not.toContain(en['dlg.b4.fritz'].slice(0, 20));
    await page.waitForTimeout(250);
  }

  // Pick up the part, reload, Continue: it is held exactly once.
  await use(page, 'ticket_printer_part', -0.2, -174, 0, -60);
  await expect.poll(() => page.evaluate(() => window.__hero!.inventory!())).toEqual(['ticket_printer_part']);
  await page.waitForTimeout(500);
  const again = await enter(page, 'continue');
  expect(await page.evaluate(() => window.__hero!.inventory!())).toEqual(['ticket_printer_part']);
  expect(again).toEqual([]);
  expect(errors).toEqual([]);
});
