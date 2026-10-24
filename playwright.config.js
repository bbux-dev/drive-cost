import { defineConfig, devices } from '@playwright/test';
const hosted = process.env.E2E_BASE_URL;
const production = process.env.E2E_PRODUCTION === '1';
const localURL = production ? 'http://127.0.0.1:4180' : 'http://127.0.0.1:4179';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: { baseURL: hosted || localURL, trace: 'retain-on-failure', timezoneId: 'America/Los_Angeles' },
  webServer: hosted ? undefined : { command: production ? 'pnpm preview' : 'pnpm dev', url: localURL, reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } }
  ]
});
