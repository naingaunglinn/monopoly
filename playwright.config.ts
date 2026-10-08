import { defineConfig, devices } from '@playwright/test';

// End-to-end runs use the production build served by `vite preview` (fonts and flags inlined), and
// for online play the local server (API on MemoryStore + the same build) on port 4175.
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
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Voice chat tests (spec section 18): a fake microphone (it beeps), no permission prompt, and
        // plain local addresses so two browser contexts connect on this machine.
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 240_000,
    },
    // Online play: the same built game plus the API on MemoryStore (server/local.ts). Its stream
    // ends every 20 s here, so reconnects happen during the tests too.
    {
      command: 'npx tsx server/local.ts --port 4175 --static dist',
      url: 'http://localhost:4175/api/health',
      reuseExistingServer: false,
      timeout: 240_000,
      env: { STREAM_MS: '20000' },
    },
  ],
});
