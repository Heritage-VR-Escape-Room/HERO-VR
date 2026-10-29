import { test, expect } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default', 'asset loading is backend-independent; default project only');
});

/** `bodyZ`: measure length along z only (the crow's authored pose has its wings spread across x, 1.3 m span). */
const MODELS: Record<string, { maxTris: number; axis: 'height' | 'length'; meters: number; bodyZ?: boolean; tol?: number }> = {
  streetlamp: { maxTris: 15_000, axis: 'height', meters: 4.5 },
  bench: { maxTris: 30_000, axis: 'length', meters: 1.8 },
  kiosk: { maxTris: 30_000, axis: 'height', meters: 3.2 },
  newspapers: { maxTris: 30_000, axis: 'length', meters: 0.4 },
  tree_linden: { maxTris: 40_000, axis: 'height', meters: 18 },
  tree_chestnut: { maxTris: 40_000, axis: 'height', meters: 16 },
  hedge: { maxTris: 30_000, axis: 'length', meters: 2 },
  raven_rigged: { maxTris: 30_000, axis: 'length', meters: 0.6, bodyZ: true, tol: 0.1 },
  human_npc_m: { maxTris: 30_000, axis: 'height', meters: 1.75 },
  human_npc_m2: { maxTris: 30_000, axis: 'height', meters: 1.75 },
  human_npc_f: { maxTris: 30_000, axis: 'height', meters: 1.65 },
};

test('every placeholder model loads through loadModel at real-world size, within its triangle budget', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__hero?.loadModelInfo === 'function', undefined, { timeout: 30_000 });
  for (const [slug, want] of Object.entries(MODELS)) {
    const info = await page.evaluate((s) => window.__hero!.loadModelInfo!(s), slug);
    expect(info.tris, `${slug} triangles`).toBeGreaterThan(0);
    expect(info.tris, `${slug} budget`).toBeLessThanOrEqual(want.maxTris);
    const measured = want.axis === 'height' ? info.size[1] : want.bodyZ ? info.size[2] : Math.max(info.size[0], info.size[2]);
    const tol = want.tol ?? 0.05;
    // Skinned bind-pose bounds can differ a little from the Blender measurement; the tolerance is only there to catch a unit error.
    expect.soft(measured, `${slug} ${want.axis}`).toBeGreaterThan(want.meters * (1 - tol));
    expect.soft(measured, `${slug} ${want.axis}`).toBeLessThan(want.meters * (1 + tol));
    expect.soft(info.min[1], `${slug} pivot at the bottom`).toBeGreaterThan(-0.05);
    expect.soft(info.min[1], `${slug} pivot at the bottom`).toBeLessThan(0.05);
  }
  expect(errors).toEqual([]);
});

test('the crow loads with its clip and a findRig-compatible bone set', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__hero?.loadModelInfo === 'function', undefined, { timeout: 30_000 });
  const info = await page.evaluate(() => window.__hero!.loadModelInfo!('raven_rigged'));
  console.log(`CROW clips=${JSON.stringify(info.clips)} bones=${info.bones.length}\n${info.bones.join(' | ')}`);
  expect(info.clips.length).toBeGreaterThan(0);
  expect(info.bones.length).toBeGreaterThan(10);
});
