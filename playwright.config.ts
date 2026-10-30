import { defineConfig } from '@playwright/test';

const use = {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1920, height: 1080 },
  baseURL: 'http://localhost:4173',
  // Test windows are visible (WebGPU needs a headed Chrome); keep them silent.
  launchOptions: { args: ['--mute-audio'] as string[] },
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
      use: { ...use, launchOptions: { args: ['--mute-audio', '--disable-features=WebGPU'] } },
    },
  ],
});
