import { test, expect, type Page } from '@playwright/test';
import en from '../../public/locales/en.json' with { type: 'json' };
import ar from '../../public/locales/ar.json' with { type: 'json' };
import de from '../../public/locales/de.json' with { type: 'json' };

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'menu specs run in the default project only');
});

const tables = { en, ar, de } as Record<string, Record<string, string>>;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Boot to the main menu and wait until its background renders. */
async function openMenu(page: Page, query = ''): Promise<void> {
  await page.goto(`/?test=1${query}`);
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 10, undefined, { timeout: 60_000 });
  await expect(page.locator('#menu')).toBeVisible();
}

async function openSettings(page: Page, tab: string): Promise<void> {
  await page.click('#menu-settings');
  await expect(page.locator('#settings')).toBeVisible();
  await page.click(`#settings [data-tab="${tab}"]`);
}

/**
 * Click `selector` (a user gesture) until the pointer locks and play resumes.
 * Chrome refuses a lock while its window is not in front, and sometimes on a
 * freshly loaded page (the older player specs flake on HEAD the same way), so
 * bring the page forward and retry.
 */
async function clickUntilPlaying(page: Page, click: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await page.bringToFront();
    await click();
    try {
      await page.waitForFunction(() => window.__hero!.gameState!() === 'playing', undefined, { timeout: 2_500 });
      return;
    } catch {
      /* refused; click again */
    }
  }
  throw new Error('pointer lock never granted');
}

const lockPointer = (page: Page) => clickUntilPlaying(page, () => page.mouse.click(960, 540));
const resume = (page: Page) => clickUntilPlaying(page, () => page.click('#pause-resume'));

const settings = (page: Page) => page.evaluate(() => window.__hero!.settings!());

test('no save → Continue hidden', async ({ page }) => {
  const errors = collectErrors(page);
  await openMenu(page);
  await expect(page.locator('#menu-continue')).toBeHidden();
  await expect(page.locator('#menu-new')).toBeVisible();
  await page.screenshot({ path: 'test-results/menu-en.png' });
  expect(errors).toEqual([]);
});

test('corrupt save (localStorage seeded with "{bad") → Continue hidden, boots', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('som.save.v1', '{bad'));
  await openMenu(page);
  await expect(page.locator('#menu-continue')).toBeHidden();
  expect(errors).toEqual([]);
});

test('valid save → Continue shown and restores the story', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'som.save.v1',
      JSON.stringify({
        version: 1,
        checkpointId: 'cp_lock',
        solvedPuzzles: ['lock'],
        inventory: [],
        firedBeats: ['b1_wake'],
        disabledObjects: [],
        savedAtUtc: '2026-10-28T00:00:00.000Z',
      }),
    ),
  );
  await openMenu(page);
  await expect(page.locator('#menu-continue')).toBeVisible();
  await page.click('#menu-continue');
  await page.waitForFunction(() => window.__hero!.playerPos !== undefined, undefined, { timeout: 60_000 });
  await expect(page.locator('#menu')).toBeHidden();
  const story = await page.evaluate(() => window.__hero!.storyState!());
  expect(story.firedBeats).toContain('b1_wake');
  expect(story.solvedPuzzles).toContain('lock');
  expect(errors).toEqual([]);
});

test('localStorage blocked (addInitScript makes getItem/setItem throw) → boots to menu', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await openMenu(page);
  await expect(page.locator('#menu-new')).toBeVisible();
  // Changing a setting must not throw either.
  await openSettings(page, 'subtitles');
  await page.click('#settings [data-field="subtitleSize"][data-value="L"]');
  expect((await settings(page)).subtitleSize).toBe('L');
  expect(errors).toEqual([]);
});

test('select Arabic → html dir rtl, menu labels Arabic', async ({ page }) => {
  const errors = collectErrors(page);
  await openMenu(page);
  await openSettings(page, 'language');
  await page.click('#settings [data-locale="ar"]');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ar');
  await page.click('#settings-back');
  await expect(page.locator('#menu-new')).toHaveText(ar['ui.menu.new']!);
  await expect(page.locator('#menu-settings')).toHaveText(ar['ui.menu.settings']!);
  await expect(page.locator('#menu-credits')).toHaveText(ar['ui.menu.credits']!);
  // Mirrored: the menu column sits on the right half of the screen.
  const box = await page.locator('#menu .menu-column').boundingBox();
  expect(box!.x).toBeGreaterThan(960);
  await page.screenshot({ path: 'test-results/menu-ar.png' });
  expect(errors).toEqual([]);
});

test('frame cap 30 → __hero.renderFps() between 27 and 31 over 3 s', async ({ page }) => {
  const errors = collectErrors(page);
  await openMenu(page);
  await openSettings(page, 'graphics');
  await page.click('#settings [data-field="frameCap"][data-value="30"]');
  expect((await settings(page)).custom?.frameCap).toBe(30);
  await page.waitForTimeout(3500);
  const fps = await page.evaluate(() => window.__hero!.renderFps!());
  expect(fps).toBeGreaterThanOrEqual(27);
  expect(fps).toBeLessThanOrEqual(31);
  expect(errors).toEqual([]);
});

test('rebind Escape rejected', async ({ page }) => {
  const errors = collectErrors(page);
  await openMenu(page);
  await openSettings(page, 'controls');
  await page.click('#settings [data-rebind="interact"]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#rebind-msg')).toHaveText(en['ui.settings.reserved']!.replace('{key}', 'Esc'));
  expect((await settings(page)).bindings.interact).toBe('KeyE');
  // The rejected key does not close the settings screen.
  await expect(page.locator('#settings')).toBeVisible();
  expect(errors).toEqual([]);
});

test('rebind interact to W swaps', async ({ page }) => {
  const errors = collectErrors(page);
  await openMenu(page);
  await openSettings(page, 'controls');
  await page.click('#settings [data-rebind="interact"]');
  await page.keyboard.press('KeyW');
  const b = (await settings(page)).bindings;
  expect(b.interact).toBe('KeyW');
  expect(b.forward).toBe('KeyE');
  await expect(page.locator('#rebind-msg')).toHaveText(en['ui.settings.swapped']!.replace('{action}', en['ui.action.forward']!));
  await expect(page.locator('#settings [data-rebind="forward"]')).toHaveText('E');
  expect(errors).toEqual([]);
});

test('settings persist across reload', async ({ page }) => {
  const errors = collectErrors(page);
  await openMenu(page);
  await openSettings(page, 'language');
  await page.click('#settings [data-locale="de"]');
  await page.click('#settings [data-tab="subtitles"]');
  await page.click('#settings [data-field="subtitleSize"][data-value="S"]');
  await page.click('#settings [data-tab="graphics"]');
  await page.click('#settings [data-field="preset"][data-value="Low"]');
  await page.reload();
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 10, undefined, { timeout: 60_000 });
  const s = await settings(page);
  expect(s.locale).toBe('de');
  expect(s.subtitleSize).toBe('S');
  expect(s.preset).toBe('Low');
  expect(s.custom).toBeNull();
  await expect(page.locator('#menu-new')).toHaveText(de['ui.menu.new']!);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
  expect(errors).toEqual([]);
});

test('graphics changes rebuild the post chain without leaking textures', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await openMenu(page);
  await openSettings(page, 'graphics');
  const frames = async (n: number): Promise<void> => {
    const s = await page.evaluate(() => window.__hero!.frames!());
    await page.waitForFunction((t) => window.__hero!.frames!() > t, s + n, { timeout: 30_000 });
  };
  const pick = async (field: string, value: string): Promise<void> => {
    await page.click(`#settings [data-field="${field}"][data-value="${value}"]`);
    await frames(5);
  };
  const cycle = async (): Promise<void> => {
    await pick('aa', 'FXAA');
    await pick('ssao', 'false');
    await pick('shadows', 'Low');
    await pick('renderScale', '0.67');
    await pick('motionBlur', 'true');
    await pick('preset', 'High');
  };
  await cycle();
  const baseline = await page.evaluate(() => window.__hero!.gpuTextures!());
  for (let i = 0; i < 3; i++) await cycle();
  const after = await page.evaluate(() => window.__hero!.gpuTextures!());
  expect(after).toBeLessThanOrEqual(baseline + 4);
  expect(errors).toEqual([]);
});

test('pause → click Resume → playing', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?test=1&scene=flat');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  await lockPointer(page);
  await expect(page.locator('#crosshair')).toBeVisible();
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#crosshair')).toBeHidden();
  expect(await page.evaluate(() => window.__hero!.gameState!())).toBe('paused');
  await resume(page);
  await expect(page.locator('#pause')).toBeHidden();
  expect(errors).toEqual([]);
});

test('refused re-lock keeps pause open with a note; the next Resume click plays', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?test=1&scene=flat');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  await lockPointer(page);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('.pause-note')).toBeHidden();
  // Chrome's post-Esc cooldown, simulated: the next request rejects and fires pointerlockerror.
  await page.evaluate(() => {
    const proto = HTMLCanvasElement.prototype;
    const real = proto.requestPointerLock;
    proto.requestPointerLock = function (this: HTMLCanvasElement) {
      proto.requestPointerLock = real;
      document.dispatchEvent(new Event('pointerlockerror'));
      return Promise.reject(new DOMException('refused', 'SecurityError'));
    } as typeof real;
  });
  await page.click('#pause-resume');
  await expect(page.locator('.pause-note')).toBeVisible();
  await expect(page.locator('#pause')).toBeVisible();
  expect(await page.evaluate(() => window.__hero!.gameState!())).toBe('paused');
  // One more click, no retry: the real request goes through.
  await page.bringToFront();
  await page.click('#pause-resume');
  await page.waitForFunction(() => window.__hero!.gameState!() === 'playing', undefined, { timeout: 5_000 });
  await expect(page.locator('#pause')).toBeHidden();
  expect(errors).toEqual([]);
});

test('subtitles hold while paused', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?test=1&scene=flat');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  await lockPointer(page);
  await page.evaluate(() => window.__hero!.fireBeat!('b1_wake'));
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator('#pause')).toBeVisible();
  // b1 is a short line; paused, it must still be on screen well past its duration.
  await page.waitForTimeout(6000);
  await expect(page.locator('#subtitle-text')).toHaveText(en['dlg.b1.julian']!);
  await resume(page);
  await expect(page.locator('#subtitle')).toBeHidden({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

/** Screenshots of every settings tab in each language, for the visual check. */
test('settings tab screenshots (en, ar, de)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  for (const locale of ['en', 'ar', 'de']) {
    await openMenu(page, `&lang=${locale}`);
    await page.screenshot({ path: `test-results/menu-${locale}.png` });
    await page.click('#menu-settings');
    for (const tab of ['language', 'controls', 'graphics', 'audio', 'subtitles']) {
      await page.click(`#settings [data-tab="${tab}"]`);
      await expect(page.locator(`#settings [data-tab="${tab}"]`)).toHaveText(tables[locale]![`ui.settings.tab.${tab}`]!);
      await page.screenshot({ path: `test-results/settings-${locale}-${tab}.png` });
    }
  }
  expect(errors).toEqual([]);
});
