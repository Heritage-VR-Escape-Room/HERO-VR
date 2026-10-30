import { test } from '@playwright/test';
const OUT = 'C:/Users/Work/AppData/Local/Temp/claude/C--Users-Work--local-bin/0d203b11-857d-4449-b5ff-8471ae552941/scratchpad/diag';
test('diag', async ({ page }) => {
  test.setTimeout(300_000);
  const t0 = Date.now();
  const log = (s: string) => console.log(`DIAG ${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
  page.on('console', (m) => log(`console.${m.type()}: ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => log(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => log(`reqfail ${r.url()}`));
  let bytes = 0;
  page.on('response', async (r) => { const l = Number(r.headers()['content-length'] ?? 0); bytes += l; });
  await page.goto('/');
  for (const s of [3, 8]) {
    await page.waitForTimeout(s * 1000 - (Date.now() - t0));
    await page.screenshot({ path: `${OUT}/menu-${s}s.png` });
    log(`shot ${s}s, bytes so far ${(bytes / 1e6).toFixed(1)} MB`);
  }
  await page.click('#menu-new').catch((e) => log('no new button ' + e));
  const t1 = Date.now();
  for (const s of [10, 30, 60]) {
    await page.waitForTimeout(s * 1000 - (Date.now() - t1));
    await page.screenshot({ path: `${OUT}/game-${s}s.png` });
    const info = await page.evaluate(() => ({ fps: window.__hero?.renderFps?.(), preset: window.__hero?.settings?.().preset, tex: window.__hero?.gpuTextures?.() }));
    log(`game shot ${s}s, bytes ${(bytes / 1e6).toFixed(1)} MB ${JSON.stringify(info)}`);
  }
});
