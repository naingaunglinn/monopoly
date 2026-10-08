import { defineConfig, devices } from '@playwright/test';

// End-to-end runs use the production build served by `vite preview` (fonts and flags inlined).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
