import { test, expect, type Page } from '@playwright/test';

async function hideWebGPU(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as { gpu?: unknown }).gpu;
  });
}

/** Collects page errors and console errors (WebGPU validation errors are console errors). */
async function open(page: Page, query: string, noWebGPU: boolean): Promise<string[]> {
  if (noWebGPU) await hideWebGPU(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  await page.goto(`/?test=1&scene=fogtest&${query}`);
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });
  return errors;
}

async function frames(page: Page, n: number): Promise<void> {
  const start = await page.evaluate(() => window.__hero!.frames!());
  await page.waitForFunction((s) => window.__hero!.frames!() > s, start + n, { timeout: 30_000 });
}

for (const aa of ['TAA', 'SMAA', 'FXAA', 'Off'] as const) {
  test(`renderScale 0.67 with aa=${aa} renders cleanly`, async ({ page }, info) => {
    const noWebGPU = info.project.name === 'no-webgpu';
    const errors = await open(page, `fog=Medium&renderScale=0.67&aa=${aa}`, noWebGPU);
    await frames(page, 60);
    await page.screenshot({ path: `test-results/scale067-${noWebGPU ? 'webgl2' : 'webgpu'}-${aa}.png` });
    expect(errors).toEqual([]);
  });
}

test('DOF toggles and fog temporal-boundary switches do not leak textures', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors = await open(page, 'fog=Low', info.project.name === 'no-webgpu');
  const cycle = async (): Promise<void> => {
    await page.evaluate(() => window.__hero!.setDofFocus!(6));
    await frames(page, 5);
    await page.evaluate(() => window.__hero!.setDofFocus!(null));
    await frames(page, 5);
    await page.evaluate(() => window.__hero!.setFogQuality!('WebGL2Safe')); // temporal -> not
    await frames(page, 5);
    await page.evaluate(() => window.__hero!.setFogQuality!('Low')); // back to temporal
    await frames(page, 5);
  };
  await cycle(); // warm-up: first DOF build allocates its targets once
  const baseline = await page.evaluate(() => window.__hero!.gpuTextures!());
  for (let i = 0; i < 4; i++) await cycle();
  const after = await page.evaluate(() => window.__hero!.gpuTextures!());
  // Each leaking cycle would add several render targets; allow a little slack for lazily created textures.
  expect(after).toBeLessThanOrEqual(baseline + 4);
  expect(errors).toEqual([]);
});
