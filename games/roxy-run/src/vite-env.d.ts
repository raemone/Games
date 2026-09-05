/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the leaderboard API lives, e.g. https://roxy-run.vercel.app.
   * Unset in a normal build, which turns the world board off entirely.
   */
  readonly VITE_LEADERBOARD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
