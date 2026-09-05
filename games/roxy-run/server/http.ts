/**
 * The bits of HTTP every route repeats: CORS, JSON bodies, and finding out who
 * is calling.
 *
 * CORS matters more here than in a normal API. The game is served from GitHub
 * Pages and this runs on Vercel, so every single request from a player is
 * cross-origin - get this wrong and the board is simply invisible, with the
 * failure buried in a browser console nobody has open.
 */
import { type Env, currentEnv } from './env.js';

/** Origins allowed to read the board, beyond anything ALLOWED_ORIGINS adds. */
const DEFAULT_ORIGINS = [
  'https://raemone.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export function allowedOrigins(env: Env = currentEnv()): string[] {
  const extra = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return [...DEFAULT_ORIGINS, ...extra];
}

/**
 * The CORS headers for one request.
 *
 * An origin that is not on the list gets no allow header at all rather than a
 * wildcard, so an unknown site is refused by the browser. Requests with no
 * Origin - curl, a health check, a mobile client - are not the browser's
 * business and are left alone.
 */
export function corsHeaders(origin: string | null, env: Env = currentEnv()): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export interface JsonOptions {
  readonly status?: number;
  readonly origin?: string | null;
  /** Seconds a CDN may serve this response for. Omit for no caching. */
  readonly cacheSeconds?: number;
}

export function json(body: unknown, options: JsonOptions = {}): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(options.origin ?? null),
  };
  if (options.cacheSeconds !== undefined) {
    // Let the edge serve a slightly stale board rather than waking the database
    // for every child refreshing the screen, and keep serving it while it
    // revalidates so a slow database never shows as an empty board.
    headers['Cache-Control'] = `public, s-maxage=${options.cacheSeconds}, stale-while-revalidate=60`;
  } else {
    headers['Cache-Control'] = 'no-store';
  }
  return new Response(JSON.stringify(body), { status: options.status ?? 200, headers });
}

export function error(message: string, status: number, origin: string | null): Response {
  return json({ error: message }, { status, origin });
}

/** The reply to a CORS preflight: headers only, no body. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

/** Parse a JSON body without throwing on junk. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * The caller's address, for rate limiting.
 *
 * Vercel sets `x-forwarded-for` on every request and a client cannot spoof it
 * past the proxy, so the first entry is the real one. Behind no proxy at all
 * there is nothing to go on, and everyone shares one bucket.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : (request.headers.get('x-real-ip') ?? 'unknown');
}
