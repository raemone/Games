/**
 * Picking a store, once per warm function instance.
 *
 * Held in a module-level variable because a serverless function is reused
 * between requests: building the client per request would be wasteful, and
 * building the memory store per request would empty the board every time.
 */
import { type Env, currentEnv } from './env';
import { configFromEnv } from './redis';
import { MemoryStore, RedisStore, type Store } from './store';

export interface Backend {
  readonly store: Store;
  /** False when running on the memory store, i.e. nothing survives a restart. */
  readonly persistent: boolean;
}

let cached: Backend | null = null;

export function backend(env: Env = currentEnv()): Backend {
  if (cached) return cached;
  const config = configFromEnv(env);
  cached = config
    ? { store: new RedisStore(config), persistent: true }
    : { store: new MemoryStore(), persistent: false };
  return cached;
}

/** Tests use this to start from a known, empty backend. */
export function resetBackend(): void {
  cached = null;
}
