import { defineConfig } from 'vite';

/** Declared rather than pulling Node's whole type surface in for one lookup. */
declare const process: { env: Record<string, string | undefined> };

/**
 * The game is served from two places, at two different paths.
 *
 * On Vercel it is the whole deployment, at the root, sharing an origin with the
 * `/api/scores` function that backs the global leaderboard. On GitHub Pages it
 * is one game among three, under /Games/roxy-pinball/, with no API at all - the
 * board is read cross-origin there and submitting is the only thing missing.
 * Vercel sets VERCEL=1 during its build, which is how the two are told apart.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' && !process.env.VERCEL ? '/Games/roxy-pinball/' : '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
}));
