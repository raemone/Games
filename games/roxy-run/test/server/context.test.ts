/**
 * Which transport gets chosen, which is the decision that made the board sit
 * on the memory store while a perfectly good database was attached to the
 * project the whole time.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backend, resetBackend } from '../../server/context';

const NONE = {
  KV_REST_API_URL: '',
  KV_REST_API_TOKEN: '',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
  REDIS_URL: '',
  KV_URL: '',
  UPSTASH_REDIS_URL: '',
};

beforeEach(() => {
  for (const [name, value] of Object.entries(NONE)) vi.stubEnv(name, value);
  resetBackend();
});

describe('choosing a backend', () => {
  it('falls back to memory when nothing is configured', () => {
    expect(backend({})).toMatchObject({ persistent: false, transport: null });
  });

  it('uses REST when a URL and token are set', () => {
    const chosen = backend({ KV_REST_API_URL: 'https://db.example', KV_REST_API_TOKEN: 'tok' });
    expect(chosen).toMatchObject({ persistent: true, transport: 'rest' });
  });

  it('uses a socket when only a connection string is set', () => {
    // The case this project is actually in: a Redis attached by the platform
    // that offers no REST endpoint at all.
    expect(backend({ REDIS_URL: 'rediss://:pw@db.example:6379' })).toMatchObject({
      persistent: true,
      transport: 'tcp',
    });
  });

  it('prefers REST when both are available', () => {
    // REST needs no connection held open, which suits a function that is
    // constantly being started from cold.
    const chosen = backend({
      KV_REST_API_URL: 'https://db.example',
      KV_REST_API_TOKEN: 'tok',
      REDIS_URL: 'redis://db.example:6379',
    });
    expect(chosen.transport).toBe('rest');
  });

  it('accepts the other names a platform might use for the URL', () => {
    expect(backend({ KV_URL: 'redis://db.example' }).transport).toBe('tcp');
    resetBackend();
    expect(backend({ UPSTASH_REDIS_URL: 'redis://db.example' }).transport).toBe('tcp');
  });

  it('ignores a connection string it cannot parse instead of crashing', () => {
    expect(backend({ REDIS_URL: 'postgres://db.example' })).toMatchObject({ transport: null });
  });

  it('half a REST pair is not a database', () => {
    // A URL with no token cannot authenticate, and pretending otherwise means
    // every request fails at the database instead of falling back.
    expect(backend({ KV_REST_API_URL: 'https://db.example' }).transport).toBeNull();
  });

  it('builds the backend once and reuses it', () => {
    const first = backend({ REDIS_URL: 'redis://db.example' });
    expect(backend({})).toBe(first);
  });
});
