import { test, expect, type Page } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'fritz specs run in the default project only');
});

async function open(page: Page, props: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto(`/?test=1&scene=flat&props=${props}`);
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  await page.mouse.click(960, 540);
  await page.waitForFunction(() => window.__hero!.gameState!() === 'playing', undefined, { timeout: 10_000 });
  return errors;
}

const subtitle = (page: Page) => page.locator('#subtitle-text').innerText();
const highlighted = (page: Page) => page.evaluate(() => window.__hero!.fritz!.highlighted());

test('flies 12 m in <= 2.5 s', async ({ page }) => {
  const errors = await open(page, 'perches');
  expect(await page.evaluate(() => window.__hero!.fritz!.perch())).toBe('p1');
  const a = await page.evaluate(() => window.__hero!.fritz!.position());
  const { ms, flying } = await page.evaluate(async () => {
    const f = window.__hero!.fritz!;
    const t0 = performance.now();
    const p = f.flyTo('p2');
    await new Promise((r) => setTimeout(r, 200));
    const flying = f.state();
    await p;
    return { ms: performance.now() - t0, flying };
  });
  expect(flying).toBe('fly');
  const b = await page.evaluate(() => window.__hero!.fritz!.position());
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(12, 1);
  expect(ms).toBeLessThanOrEqual(2500);
  expect(ms).toBeGreaterThan(1500); // 6 m/s over a >= 12 m path
  expect(await page.evaluate(() => window.__hero!.fritz!.state())).toBe('perch');
  expect(await page.evaluate(() => window.__hero!.fritz!.perch())).toBe('p2');
  expect(errors).toEqual([]);
});

test('hint tiers advance with fake clock and highlight correct targets', async ({ page }) => {
  const errors = await open(page, 'lock,perches');
  const expected: Array<[number, string[], string]> = [
    [100, ['plaque'], 'The founder always watches'],
    [110, ['plaque'], 'The founder always watches'], // under 45 s: still tier 1
    [150, ['plaque'], 'The year this city was born'],
    [200, ['ring'], 'Fourteen!'],
    [250, ['tumbler', 'tumbler', 'tumbler', 'tumbler'], 'K-A-R-L'],
    [400, ['tumbler', 'tumbler', 'tumbler', 'tumbler'], 'K-A-R-L'], // capped at the last tier
  ];
  let cawsBefore = 0;
  for (const [t, names, line] of expected) {
    await page.evaluate((c) => {
      window.__hero!.setClock!(c);
      window.__hero!.requestHint!();
    }, t);
    expect(await highlighted(page)).toEqual(names);
    await expect.poll(() => subtitle(page)).toContain(line);
    cawsBefore++;
    expect(await page.evaluate(() => window.__hero!.fritz!.caws())).toBe(cawsBefore);
  }
  // The outline lasts 6 s of game time.
  await page.evaluate(() => window.__hero!.setClock!(405));
  expect(await highlighted(page)).toHaveLength(4);
  await page.evaluate(() => window.__hero!.setClock!(406.5));
  await expect.poll(() => highlighted(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('no active puzzle -> nohint line', async ({ page }) => {
  const errors = await open(page, 'perches');
  await page.keyboard.press('KeyH');
  await expect.poll(() => subtitle(page)).toContain('Patience, friend');
  expect(await highlighted(page)).toEqual([]);
  expect(await page.evaluate(() => window.__hero!.fritz!.caws())).toBe(1);
  expect(errors).toEqual([]);
});

test('perched Fritz is visible 2 m ahead', async ({ page }) => {
  const errors = await open(page, 'perches');
  await page.evaluate(() => window.__hero!.fritz!.flyTo('p3'));
  await page.waitForTimeout(1500); // settles into idle
  await page.screenshot({ path: 'test-results/fritz-perch.png' });
  expect(errors).toEqual([]);
});
