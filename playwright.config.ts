import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173/yizhe-start/',
    channel: process.platform === 'win32' ? 'chrome' : undefined,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/yizhe-start/',
    reuseExistingServer: false,
  },
});
