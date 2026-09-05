/**
 * Picking a store, once per warm function instance.
 *
 * Held in a module-level variable because a serverless function is reused
 * between requests: building the client per request would be wasteful, and
 * building the memory store per request would empty the board every time.
 *
 * The order of preference is deliberate. REST first, because it needs no
 * connection held open and no handshake on a cold start; a socket second,
 * because plenty of managed Redis offers nothing else; memory last, so the
 * game still works when there is no database at all.
 */
import { type Env, currentEnv } from './env.js';
import type { Redis } from './protocol.js';
import { RestRedis, configFromEnv } from './redis.js';
import { MemoryStore, RedisStore, type Store } from './store.js';
import { TcpRedis, parseRedisUrl } from './tcp.js';

/** How the database is reached, or null when there is no database. */
export type Transport = 'rest' | 'tcp' | null;

export interface Backend {
  readonly store: Store;
  /** False when running on the memory store, i.e. nothing survives a restart. */
  readonly persistent: boolean;
  readonly transport: Transport;
}

let cached: Backend | null = null;

/** The connection string variables a managed Redis might set, in preference order. */
const URL_VARIABLES = ['REDIS_URL', 'KV_URL', 'UPSTASH_REDIS_URL'] as const;

export function backend(env: Env = currentEnv()): Backend {
  if (cached) return cached;
  cached = choose(env);
  return cached;
}

function choose(env: Env): Backend {
  const rest = configFromEnv(env);
  if (rest) return connected(new RestRedis(rest), 'rest');

  for (const name of URL_VARIABLES) {
    const tcp = parseRedisUrl(env[name]);
    if (tcp) return connected(new TcpRedis(tcp), 'tcp');
  }

  return { store: new MemoryStore(), persistent: false, transport: null };
}

function connected(redis: Redis, transport: Transport): Backend {
  return { store: new RedisStore(redis), persistent: true, transport };
}

/** Tests use this to start from a known, empty backend. */
export function resetBackend(): void {
  cached = null;
}
