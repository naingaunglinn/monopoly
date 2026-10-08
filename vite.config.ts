import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Fonts and flags are inlined into the bundle so the game keeps working with the network off
// (lazy font subsets or flag files fetched later would fail offline).
const INLINE_EXTENSIONS = /\.(woff2?|svg)$/i;

export default defineConfig({
  plugins: [react()],
  // npm run dev:online: the dev server forwards /api to the local online server (server/local.ts).
  server: {
    port: 5173,
    strictPort: true,
    proxy: process.env.API_PROXY ? { '/api': { target: process.env.API_PROXY, changeOrigin: false } } : undefined,
  },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: (filePath: string) => (INLINE_EXTENSIONS.test(filePath) ? true : undefined),
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/engine/**/*.test.ts', 'tests/ui/**/*.test.{ts,tsx}', 'tests/server/**/*.test.ts'],
    environment: 'node',
    // jsdom renders of the full board and the long engine runs are slow under parallel load.
    testTimeout: 30_000,
  },
});
