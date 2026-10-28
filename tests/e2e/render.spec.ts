import { test, expect, type Page } from '@playwright/test';
import { FOG_QUALITIES } from '../../src/logic/fogQuality';

/** Same fallback trick as boot.spec.ts: really remove WebGPU in the no-webgpu project. */
async function hideWebGPU(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as { gpu?: unknown }).gpu;
  });
}

for (const q of FOG_QUALITIES) {
  test(`fogtest renders at fog ${q}, density constant`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const noWebGPU = info.project.name === 'no-webgpu';
    if (noWebGPU) await hideWebGPU(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`/?test=1&scene=fogtest&fog=${q}`);
    await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 60_000 });

    const backend = await page.evaluate(() => window.__hero!.backend!);
    expect(backend).toBe(noWebGPU ? 'webgl2' : 'webgpu');
    // WebGL2 always runs the cheapest fog tier.
    expect(await page.evaluate(() => window.__hero!.fogQuality!())).toBe(noWebGPU ? 'WebGL2Safe' : q);

    await page.screenshot({ path: `test-results/fog-${backend}-${q}.png` });

    const before = await page.evaluate(() => window.__hero!.fogDensity!());
    expect(before).toBeGreaterThan(0);
    const framesBefore = await page.evaluate(() => window.__hero!.frames!());
    await page.waitForTimeout(10_000);
    expect(await page.evaluate(() => window.__hero!.fogDensity!())).toBe(before);
    // Still rendering after 10 s.
    expect(await page.evaluate(() => window.__hero!.frames!())).toBeGreaterThan(framesBefore);
    expect(errors).toEqual([]);
  });
}
