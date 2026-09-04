import { defineConfig } from 'vite';

// Served from https://<user>.github.io/Games/roxy-run/ in production,
// but from / during local dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Games/roxy-run/' : '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
}));
