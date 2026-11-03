import { defineConfig, devices } from '@playwright/test';

const APP = process.env.E2E_APP_ORIGIN ?? 'http://localhost:3100';
const PROXY = process.env.E2E_PROXY_ORIGIN ?? 'http://localhost:8788';
const FIXTURES = 'http://localhost:4600';

/**
 * E2E runs against a production build (`next start`) on non-default ports, so it never
 * collides with `pnpm dev`. MOCK_AI=1 always.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: APP, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'] } },
    { name: 'webkit-ipad', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: [
    {
      command: 'bash scripts/e2e-app.sh',
      url: `${APP}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: 'bash scripts/e2e-proxy.sh',
      url: `${PROXY}/__ping`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  metadata: { APP, PROXY, FIXTURES },
});
