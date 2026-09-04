import { defineConfig } from 'vitest/config';

// Served from https://<user>.github.io/Games/poop-patrol/ in production,
// but from / during local dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Games/poop-patrol/' : '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    // Tests run in a zone west of UTC on purpose: a date bug that only shows
    // up outside UTC must fail here rather than in the backyard.
    env: { TZ: 'America/New_York' },
  },
}));
