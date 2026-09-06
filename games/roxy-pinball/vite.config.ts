import { defineConfig } from 'vite';

// Served from https://<user>.github.io/Games/roxy-pinball/ in production,
// but from / during local dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Games/roxy-pinball/' : '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
}));
