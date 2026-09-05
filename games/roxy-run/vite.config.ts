import { defineConfig } from 'vitest/config';

// Served from https://<user>.github.io/Games/roxy-run/ in production,
// but from / during local dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Games/roxy-run/' : '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    // The world board reads its URL once, when the module loads. Without one
    // here every leaderboard test would short-circuit and quietly prove
    // nothing; this URL is never actually called, because fetch is stubbed.
    env: { VITE_LEADERBOARD_URL: 'https://board.test' },
  },
}));
