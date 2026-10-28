import { defineConfig } from '@playwright/test';

const use = {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1920, height: 1080 },
  baseURL: 'http://localhost:4173',
} as const;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  reporter: 'list',
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'default', use: { ...use } },
    {
      name: 'no-webgpu',
      use: { ...use, launchOptions: { args: ['--disable-features=WebGPU'] } },
    },
  ],
});
