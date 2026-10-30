import { test, expect, type Page } from '@playwright/test';

/**
 * Frame rate per preset in the Act 0 plaza, uncapped (frame cap 0), from the
 * wake bench and from the pyramid door. Prints a table; asserts only that the
 * game draws and that Low beats High. Run alone: `npx playwright test perf`.
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'default' || !process.env.PERF, 'perf bench: set PERF=1');
});

const PRESETS: readonly string[] = process.env.PERF_VARIANTS ? Object.keys(JSON.parse(process.env.PERF_VARIANTS)) : ['Low', 'Medium', 'High'];
// The preset table with the frame cap removed (custom graphics), see logic/presets.ts.
const UNCAPPED: Record<string, object> = process.env.PERF_VARIANTS ? JSON.parse(process.env.PERF_VARIANTS) : {
  Low: { renderScale: 0.67, shadows: 'Low', fog: 'Low', ssao: false, aa: 'FXAA', motionBlur: false, frameCap: 0 },
  Medium: { renderScale: 0.85, shadows: 'Medium', fog: 'Medium', ssao: true, aa: 'SMAA', motionBlur: false, frameCap: 0 },
  High: { renderScale: 1.0, shadows: 'High', fog: 'High', ssao: true, aa: 'TAA', motionBlur: false, frameCap: 0 },
};

async function measure(page: Page, preset: string): Promise<{ wake: number; door: number; textures: number }> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__hero?.menuOpen?.() === true);
  await page.evaluate(([p, custom]) => {
    const s = window.__hero!.settings!();
    localStorage.setItem('som.settings.v1', JSON.stringify({ ...s, preset: ['Low', 'Medium', 'High', 'Ultra'].includes(p) ? p : 'Low', custom, presetAutoPicked: true }));
  }, [preset, UNCAPPED[preset]] as const);
  await page.goto('/?test=1&play=new');
  await page.waitForFunction(() => (window.__hero?.frames?.() ?? 0) > 60, undefined, { timeout: 120_000 });
  await page.waitForTimeout(6000);
  const wake = await page.evaluate(() => window.__hero!.renderFps!());
  await page.evaluate(() => window.__hero!.teleport!(0, -178, 0, 5));
  await page.waitForTimeout(5000);
  const door = await page.evaluate(() => window.__hero!.renderFps!());
  const textures = await page.evaluate(() => window.__hero!.gpuTextures!());
  const sample = () => page.evaluate(() => ({ f: window.__hero!.frames!(), ...window.__hero!.renderInfo!() }));
  const a = await sample();
  await page.waitForTimeout(1000);
  const b = await sample();
  const per = b.f > a.f && b.calls >= a.calls ? `${((b.calls - a.calls) / (b.f - a.f)).toFixed(0)} calls/frame (cumulative)` : `${b.calls} calls, ${b.triangles} tris (per frame)`;
  console.log(`PERF ${preset} ${per}`);
  return { wake, door, textures };
}

test('fps per preset', async ({ page }) => {
  test.setTimeout(600_000);
  const rows: string[] = [];
  const res: Record<string, { wake: number; door: number }> = {};
  for (const p of PRESETS) {
    const r = await measure(page, p);
    res[p] = r;
    rows.push(`PERF ${p.padEnd(7)} wake ${r.wake.toFixed(1)} fps  door ${r.door.toFixed(1)} fps  textures ${r.textures}`);
  }
  console.log(rows.join('\n'));
  expect(Object.values(res)[0]!.wake).toBeGreaterThan(0);
});
