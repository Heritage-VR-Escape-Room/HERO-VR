import { test, expect, type Page } from '@playwright/test';
import en from '../../public/locales/en.json' with { type: 'json' };

/**
 * Act 0 (new script) from the main menu to the end card. Interact, hint, the
 * journal and the lenses use real key presses; the hooks only teleport and
 * drive the panel's switches and jumper.
 */

const SHOTS = 'docs/screenshots/slice';
const subtitle = (page: Page): Promise<string> => page.locator('#subtitle-text').innerText().catch(() => '');

async function waitBeat(page: Page, id: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction((b) => window.__hero!.storyState!().firedBeats.includes(b), id, { timeout });
}

/** Pointer lock (playing); Chrome refuses it while the window is not in front, so retry the click. */
async function playing(page: Page): Promise<void> {
  if ((await page.evaluate(() => window.__hero!.gameState!())) === 'playing') return;
  await page.bringToFront();
  await expect
    .poll(
      async () => {
        await page.mouse.click(960, 540);
        return page.evaluate(() => window.__hero!.gameState!());
      },
      { timeout: 20_000, intervals: [1500] },
    )
    .toBe('playing');
}

/** Stand at (x, z), look along `yaw` / `pitch` and press E on `id`. */
async function use(page: Page, id: string, x: number, z: number, yaw: number, pitch: number): Promise<void> {
  await playing(page);
  await page.evaluate(([px, pz, y, p]) => window.__hero!.teleport!(px!, pz!, y!, p), [x, z, yaw, pitch]);
  await page
    .waitForFunction((i) => window.__hero!.focusedId!() === i, id, { timeout: 10_000 })
    .catch(async (e: Error) => {
      const why = await page.evaluate(() => ({ s: window.__hero!.gameState!(), f: window.__hero!.focusedId!(), c: window.__hero!.cameraPose!() }));
      throw new Error(`${id} not focused: ${JSON.stringify(why)} ${e.message}`);
    });
  await page.keyboard.press('KeyE');
}

/** Walk up to an NPC (1.5 m away, from the plaza side) and press E to talk. */
async function talkTo(page: Page, role: string): Promise<void> {
  const n = (await page.evaluate(() => window.__hero!.npcs!())).find((x) => x.role === role)!;
  // From the NPC toward the pyramid's south side of the plaza, then face back.
  const dx = 0 - n.x;
  const dz = -182 - n.z;
  const d = Math.hypot(dx, dz) || 1;
  const x = n.x + (dx / d) * 1.5;
  const z = n.z + (dz / d) * 1.5;
  const yaw = (Math.atan2(-(n.x - x), n.z - z) * 180) / Math.PI;
  await use(page, `npc_${role}`, x, z, yaw, -3);
}

async function enter(page: Page, button: 'new' | 'continue', lang = 'en'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?test=1&lang=${lang}`);
  await page.waitForFunction(() => window.__hero?.menuOpen?.() === true, undefined, { timeout: 60_000 });
  await page.click(`#menu-${button}`);
  await page.waitForFunction(() => window.__hero?.playerPos?.() !== undefined && (window.__hero.frames?.() ?? 0) > 30, undefined, { timeout: 120_000 });
  return errors;
}

async function shot(page: Page, name: string, lang = 'en'): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/act0-${lang === 'en' ? '' : `${lang}-`}${name}.png` });
}

/** The panel: switches 1 and 4, the jumper to the top-right terminal. */
async function solveCircuit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const c = window.__hero!.circuit!;
    c.flip(0);
    c.flip(3);
    c.plug('TR');
  });
}

async function skipIntro(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !window.__hero!.introActive!(), undefined, { timeout: 5_000 });
}

async function playthrough(page: Page, lang: string, watchIntro: boolean): Promise<void> {
  // The intro: title cards, the flight down; then black, wake up.
  expect(await page.evaluate(() => window.__hero!.introActive!())).toBe(true);
  if (watchIntro) {
    await page.waitForTimeout(1500);
    await shot(page, 'intro-card', lang);
    await page.waitForTimeout(12_000);
    await shot(page, 'intro-flight', lang);
    await page.waitForFunction(() => !window.__hero!.introActive!(), undefined, { timeout: 40_000 });
  } else await skipIntro(page);
  // The game world draws (a black frame compresses to a few KB).
  await page.waitForTimeout(3500);
  expect((await page.screenshot()).length).toBeGreaterThan(200_000);

  // b1, then Fritz flies down and introduces himself, then follows.
  await waitBeat(page, 'b1_wake');
  const start = await page.evaluate(() => window.__hero!.playerPos!());
  expect(Math.hypot(start.x - 6, start.z + 150.3)).toBeLessThan(1);
  await waitBeat(page, 'b_fritz_intro', 30_000);
  await page.waitForTimeout(1200);
  await shot(page, 'fritz-intro', lang);
  await page.waitForFunction(() => window.__hero!.followerOn!(), undefined, { timeout: 40_000 });
  await playing(page);
  // He follows: the player moves north, he flies after.
  await page.evaluate(() => window.__hero!.teleport!(6, -138, 0));
  await expect
    .poll(
      async () => {
        const [f, p] = await page.evaluate(() => [window.__hero!.fritz!.position(), window.__hero!.playerPos!()]);
        return Math.hypot(f.x - p.x, f.z - p.z);
      },
      { timeout: 20_000 },
    )
    .toBeLessThan(5);
  await page.waitForTimeout(800);
  await shot(page, 'fritz-follows', lang);

  // The kiosk owner: rant nearby, then talk.
  await page.evaluate(() => window.__hero!.teleport!(-12, -160, 270));
  await waitBeat(page, 'b2_newsstand');
  await page.waitForFunction(() => !window.__hero!.dialoguePlaying!(), undefined, { timeout: 20_000 });
  await talkTo(page, 'owner');
  if (lang === 'en') await expect.poll(() => subtitle(page)).toContain(en['talk.owner.1']);
  await page.waitForTimeout(500);
  await shot(page, 'talk-owner', lang);

  // Anvin at the panel; talking to him again gives the next line.
  await page.waitForFunction(() => !window.__hero!.dialoguePlaying!(), undefined, { timeout: 20_000 });
  await page.evaluate(() => window.__hero!.teleport!(-2, -180, 0));
  await waitBeat(page, 'b_anvin');
  await page.waitForTimeout(800);
  await shot(page, 'anvin', lang);
  await page.waitForFunction(() => !window.__hero!.dialoguePlaying!(), undefined, { timeout: 30_000 });
  await talkTo(page, 'anvin');
  if (lang === 'en') await expect.poll(() => subtitle(page)).toContain(en['talk.anvin.1']);
  await page.waitForFunction(() => !window.__hero!.dialoguePlaying!(), undefined, { timeout: 20_000 });
  await talkTo(page, 'anvin');
  if (lang === 'en') await expect.poll(() => subtitle(page)).toContain(en['talk.anvin.2']);

  // The panel: Julian's line, the puzzle view, three hints over the holo-link.
  await page.waitForFunction(() => !window.__hero!.dialoguePlaying!(), undefined, { timeout: 20_000 });
  await use(page, 'circuit_bridge', -1.45, -174.6, 0, -22);
  await waitBeat(page, 'b_panel');
  await page.waitForFunction(() => window.__hero!.circuit!.state().ready, undefined, { timeout: 10_000 });
  if (lang === 'en') {
    for (let i = 1; i <= 3; i++) {
      await page.evaluate((t) => window.__hero!.setClock!(t), 1000 + i * 31);
      await page.keyboard.press('KeyH');
      await expect.poll(() => subtitle(page)).toContain((en as Record<string, string>)[`hint.circuit.${i}`]!);
    }
    await page.evaluate(() => window.__hero!.setClock!(null));
    await expect(page.locator('#holo')).toBeVisible();
  }
  await shot(page, 'circuit', lang);
  // A crossed red wire on a live node shorts the board.
  await page.evaluate(() => {
    window.__hero!.circuit!.flip(0);
    window.__hero!.circuit!.flip(1);
  });
  expect(await page.evaluate(() => window.__hero!.circuit!.state().short)).toBe(true);
  await page.waitForTimeout(400);
  await shot(page, 'circuit-short', lang);
  await page.evaluate(() => {
    window.__hero!.circuit!.flip(1);
    window.__hero!.circuit!.flip(0);
  });
  await solveCircuit(page);
  await waitBeat(page, 'b_circuit_solved');
  await page.waitForTimeout(300);
  await shot(page, 'circuit-solved', lang);
  expect((await page.evaluate(() => window.__hero!.storyState!())).solvedPuzzles).toContain('circuit_bridge');
  expect(await page.evaluate(() => localStorage.getItem('som.save.v1'))).toContain('circuit_bridge');
  await expect.poll(() => page.evaluate(() => window.__hero!.jammer!.state())).not.toBe('on');
  await waitBeat(page, 'b_anvin_flees', 30_000);

  // The compartment: the manifesto and the Spectrum Lenses.
  await page.waitForFunction(() => !window.__hero!.circuit!.state().focused, undefined, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await use(page, 'manifesto', 0.2, -174, 0, -60);
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await use(page, 'spectrum_lenses', -0.2, -174, 0, -60);
  await waitBeat(page, 'b_lenses');
  expect(await page.evaluate(() => window.__hero!.inventory!())).toEqual(['spectrum_lenses']);

  // The journal (J): goal, tasks, notes.
  await page.waitForFunction(() => !window.__hero!.dialoguePlaying!(), undefined, { timeout: 30_000 });
  await playing(page);
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#journal')).toBeVisible();
  if (lang === 'en') await expect(page.locator('.journal-goal')).toHaveText(en['journal.goal.prologue']);
  await shot(page, 'journal', lang);
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#journal')).toBeHidden();

  // Lenses on (L): the trail shows; follow it north to its end.
  await playing(page);
  await page.evaluate(() => window.__hero!.teleport!(4, -160, 0, -10));
  await page.keyboard.press('KeyL');
  expect(await page.evaluate(() => window.__hero!.lenses!())).toBe(true);
  await waitBeat(page, 'b_trails');
  await page.waitForTimeout(800);
  await shot(page, 'lenses-trail', lang);
  await page.evaluate(() => window.__hero!.teleport!(1.5, -111, 0));
  await waitBeat(page, 'b9_hook');
  await expect.poll(() => page.evaluate(() => window.__hero!.storyState!().checkpointId), { timeout: 60_000 }).toBe('act0_end');
  await expect(page.locator('#end-card')).toBeVisible();
  await shot(page, 'end', lang);
}

for (const lang of ['en', 'ar', 'de']) {
  test(`full playthrough ${lang}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'default' && lang !== 'en', 'translations run on WebGPU only');
    test.setTimeout(420_000);
    const errors = await enter(page, 'new', lang);
    await playthrough(page, lang, lang === 'en' && info.project.name === 'default');
    if (lang === 'en') {
      expect(await page.evaluate(() => window.__hero!.audio!.state())).toBe('running');
      const log = await page.evaluate(() => window.__hero!.audio!.log());
      for (const n of ['cough', 'raven_caw', 'tumbler_click', 'lock_clunk', 'jammer_hum_start', 'jammer_hum_stop', 'paper_rustle', 'item_pickup', 'music_act0', 'music_puzzle_circuit']) {
        expect(log, n).toContain(n);
      }
    }
    expect(errors).toEqual([]);
  });
}

test('wrong wiring does not solve and writes no save', async ({ page }, info) => {
  test.skip(info.project.name !== 'default', 'default project only');
  test.setTimeout(180_000);
  const errors = await enter(page, 'new');
  await skipIntro(page);
  await page.evaluate(() => {
    const c = window.__hero!.circuit!;
    c.flip(0);
    c.flip(3);
    c.plug('BL');
  });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__hero!.circuit!.state().solved)).toBe(false);
  expect((await page.evaluate(() => window.__hero!.storyState!())).solvedPuzzles).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('som.save.v1'))).toBeNull();
  expect(errors).toEqual([]);
});

test('resume after the circuit', async ({ page }, info) => {
  test.skip(info.project.name !== 'default', 'default project only');
  test.setTimeout(300_000);
  await enter(page, 'new');
  await skipIntro(page);
  await solveCircuit(page);
  await waitBeat(page, 'b_circuit_solved');

  // Reload, Continue: power on, compartment open, jammer dead, no intro, no replayed solve line.
  const errors = await enter(page, 'continue');
  expect(await page.evaluate(() => window.__hero!.introActive!())).toBe(false);
  expect(await page.evaluate(() => window.__hero!.circuit!.state().solved)).toBe(true);
  expect(await page.evaluate(() => window.__hero!.jammer!.state())).not.toBe('on');
  expect(await page.evaluate(() => window.__hero!.inventory!())).toEqual([]);
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    expect(await subtitle(page)).not.toContain(en['dlg.circuit_solved.fritz'].slice(0, 20));
    await page.waitForTimeout(250);
  }
  // Take the lenses, reload, Continue: held exactly once.
  await page.waitForTimeout(1500);
  await use(page, 'spectrum_lenses', -0.2, -174, 0, -60);
  await expect.poll(() => page.evaluate(() => window.__hero!.inventory!())).toEqual(['spectrum_lenses']);
  await page.waitForTimeout(500);
  const again = await enter(page, 'continue');
  expect(await page.evaluate(() => window.__hero!.inventory!())).toEqual(['spectrum_lenses']);
  expect([...errors, ...again]).toEqual([]);
});
