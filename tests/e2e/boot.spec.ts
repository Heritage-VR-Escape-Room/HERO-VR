import { test, expect, type Page } from '@playwright/test';

/**
 * `--disable-features=WebGPU` alone does not hide navigator.gpu in current Chrome
 * stable, so the no-webgpu project also removes it before any page script runs.
 */
async function hideWebGPU(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as { gpu?: unknown }).gpu;
  });
}

async function boot(page: Page, url: string): Promise<{ backend: string; errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = page.waitForEvent('console', {
    predicate: (m) => /HERO_READY backend=/.test(m.text()),
    timeout: 30_000,
  });
  await page.goto(url);
  const msg = await ready;
  const backend = /backend=(\w+)/.exec(msg.text())?.[1] ?? '';
  return { backend, errors };
}

test('boots on WebGPU', async ({ page }, info) => {
  test.skip(info.project.name === 'no-webgpu', 'WebGPU disabled in this project');
  const { backend, errors } = await boot(page, '/');
  expect(backend).toBe('webgpu');
  expect(errors).toEqual([]);
});

test('falls back to WebGL2', async ({ page }) => {
  const { backend, errors } = await boot(page, '/?forceWebGL=1');
  expect(backend).toBe('webgl2');
  expect(errors).toEqual([]);
});

test('no-webgpu project falls back to WebGL2 on plain /', async ({ page }, info) => {
  test.skip(info.project.name !== 'no-webgpu', 'only meaningful with WebGPU disabled');
  await hideWebGPU(page);
  const { backend, errors } = await boot(page, '/');
  expect(backend).toBe('webgl2');
  expect(errors).toEqual([]);
});
