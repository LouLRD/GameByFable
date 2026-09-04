import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },
  webServer: {
    // En CI, le build de production est fourni par le job `check` (artefact dist) : on sert seulement.
    command: process.env.PLAYWRIGHT_SKIP_BUILD ? 'npm run preview' : 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /(keyboard-mobile|mobile-terminal)\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet',
      testMatch: /(keyboard-mobile|mobile-terminal)\.spec\.ts/,
      use: { ...devices['Galaxy Tab S4'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile-small',
      testMatch: /mobile-terminal\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 320, height: 568 } },
    },
    {
      name: 'mobile-landscape',
      testMatch: /mobile-terminal\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 844, height: 390 } },
    },
  ],
});
