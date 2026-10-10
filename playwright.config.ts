import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke test of the production build (step 11): `vite preview` serves `dist` exactly as GitHub Pages
 * will, under the `/cloud-engineer-sim/` base path. CI runs it before deploying. Locally, set
 * PW_CHROMIUM_PATH to use a preinstalled Chromium instead of `npx playwright install chromium`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/cloud-engineer-sim/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/cloud-engineer-sim/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
