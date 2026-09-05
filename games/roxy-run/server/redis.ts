/**
 * A very small Redis client, speaking the Upstash REST protocol over fetch.
 *
 * There is no dependency here on purpose. Vercel KV and the Upstash
 * marketplace integration both hand you an HTTPS endpoint and a bearer token,
 * and a command is a JSON array posted to it - which is about thirty lines,
 * against a package that would have to be vendored, updated and trusted.
 */

import { type Env, currentEnv } from './env';

export type Command = readonly (string | number)[];

export interface RedisConfig {
  readonly url: string;
  readonly token: string;
}

/**
 * Read the connection out of the environment.
 *
 * Vercel KV sets the `KV_` names; a plain Upstash database sets the `UPSTASH_`
 * ones. Accepting both means the same code runs whichever way the database was
 * attached. Returns null when neither is present, which is the signal to fall
 * back to the in-memory store.
 */
export function configFromEnv(env: Env = currentEnv()): RedisConfig | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

/**
 * The variables a REST-capable Redis sets. Vercel KV uses the first pair, the
 * Upstash marketplace integration the second.
 *
 * Named here so `/api/health` can report which of them it can actually see.
 * An integration that sets only a `redis://` connection string - the TCP
 * protocol rather than the REST one - leaves every name below empty, and the
 * API falls back to memory without anything obviously being wrong. Being able
 * to see which names arrived is the difference between a two-minute fix and an
 * afternoon.
 */
export const REST_VARIABLES = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

/**
 * Which of those names are set. Names only - never the values, which are
 * credentials and have no business in an unauthenticated health response.
 */
export function restVariablesPresent(env: Env = currentEnv()): string[] {
  return REST_VARIABLES.filter((name) => (env[name] ?? '') !== '');
}

async function post(config: RedisConfig, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${config.url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`redis ${path || '/'} returned ${response.status}`);
  }
  return response.json();
}

function unwrap(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) throw new Error('redis returned no result');
  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string') throw new Error(`redis: ${record.error}`);
  return record.result;
}

/** Run one command and return its result. */
export async function command(config: RedisConfig, args: Command): Promise<unknown> {
  return unwrap(await post(config, '', args));
}

/**
 * Run several commands in one round trip.
 *
 * Worth having rather than a loop of `command`: a submission is four writes,
 * and four sequential requests to a database in another region is most of the
 * time the player spends waiting.
 */
export async function pipeline(config: RedisConfig, commands: readonly Command[]): Promise<unknown[]> {
  if (commands.length === 0) return [];
  const payload = await post(config, '/pipeline', commands);
  if (!Array.isArray(payload)) throw new Error('redis pipeline returned no array');
  return payload.map(unwrap);
}
