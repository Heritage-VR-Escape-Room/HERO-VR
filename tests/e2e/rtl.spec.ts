import { test, expect } from '@playwright/test';
import en from '../../public/locales/en.json' with { type: 'json' };
import ar from '../../public/locales/ar.json' with { type: 'json' };

test('Arabic is rtl, canvas text draws, switching to de restores ltr', async ({ page }, info) => {
  test.skip(info.project.name !== 'default', 'RTL check runs once, in the default project');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = page.waitForEvent('console', {
    predicate: (m) => /HERO_READY backend=/.test(m.text()),
    timeout: 30_000,
  });
  await page.goto('/?test=1&lang=ar');
  await ready;

  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ar');

  await page.evaluate(() => window.__hero!.debugCanvasText!('ui.menu.new'));
  await page.locator('#debug-canvas-text').screenshot({ path: 'test-results/rtl-canvas.png' });

  // Right-aligned: ink exists in the right half and the left margin is empty.
  const ink = await page.evaluate(() => {
    const c = document.getElementById('debug-canvas-text') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const bg = [d[0], d[1], d[2]];
    let min = c.width;
    let max = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] !== bg[0] || d[i + 1] !== bg[1] || d[i + 2] !== bg[2]) {
          if (x < min) min = x;
          if (x > max) max = x;
        }
      }
    return { min, max, width: c.width };
  });
  expect(ink.max).toBeGreaterThan(ink.width - 60);
  expect(ink.min).toBeGreaterThan(ink.width / 2 - 100);

  await page.evaluate(() => window.__hero!.setLocale!('de'));
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
  expect(errors).toEqual([]);
});

test('language switch re-resolves a playing subtitle', async ({ page }, info) => {
  test.skip(info.project.name !== 'default', 'subtitle locale check runs once, in the default project');
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = page.waitForEvent('console', {
    predicate: (m) => /HERO_READY backend=/.test(m.text()),
    timeout: 30_000,
  });
  await page.goto('/?test=1&lang=en');
  await ready;
  // Let the menu backdrop finish its first-frame pipeline compile before timing a subtitle.
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 10, undefined, { timeout: 90_000 });

  expect(await page.evaluate(() => window.__hero!.fireBeat!('b1_wake'))).toBe(true);
  await expect(page.locator('#subtitle-text')).toHaveText(en['dlg.b1.julian']);
  await expect(page.locator('#subtitle-speaker')).toHaveText(en['spk.julian']);

  await page.evaluate(() => window.__hero!.setLocale!('ar'));
  expect(await page.locator('#subtitle-text').textContent()).toBe(ar['dlg.b1.julian']);
  expect(await page.locator('#subtitle-speaker').textContent()).toBe(ar['spk.julian']);
  expect(await page.locator('#subtitle').getAttribute('dir')).toBe('rtl');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await page.locator('#subtitle').screenshot({ path: 'test-results/subtitle-ar.png' });

  // A beat fires only once.
  expect(await page.evaluate(() => window.__hero!.fireBeat!('b1_wake'))).toBe(false);
  // The line ends on its own and the panel hides.
  await expect(page.locator('#subtitle')).toBeHidden({ timeout: 10_000 });
  expect(await page.evaluate(() => window.__hero!.dialoguePlaying!())).toBe(false);
  expect(errors).toEqual([]);
});
