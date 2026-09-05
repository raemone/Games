/**
 * The board: read one level's top runs, or add a run to it, and say whether
 * anything is actually storing them.
 *
 * One resource, two verbs, because reading and writing the board are the same
 * thing seen from two sides and splitting them would only duplicate the
 * validation and the CORS handling.
 *
 * Both halves are thin on purpose - the rules live in `validate.ts` and the
 * storage in `store.ts`, which is what lets the whole API be tested by calling
 * these functions with a plain `Request`.
 *
 * These are plain functions rather than the routes themselves. The routes are
 * the files in `api/`, and each is deliberately little more than a try/catch
 * around one of these: a function that fails to load is the one failure a
 * handler cannot report on its own.
 */
import { backend } from './context.js';
import { clientIp, error, json, preflight, readJson } from './http.js';
import { LEVELS, levelById } from './levels.js';
import { restVariablesPresent, storageVariablesPresent } from './redis.js';
import type { Entry } from './store.js';
import { parseLimit, parseSubmission } from './validate.js';

/** How long the edge may hold a board. Long enough to matter, short enough to feel live. */
const BOARD_CACHE_SECONDS = 10;

/** Per-address limits. Generous for reading, tight for writing. */
const READ_LIMIT = { max: 120, windowSeconds: 60 };
const WRITE_LIMIT = { max: 20, windowSeconds: 60 };

interface Row {
  readonly rank: number;
  readonly initials: string;
  readonly score: number;
  readonly timeMs: number;
  /** True for the row belonging to whoever asked, so the client can highlight it. */
  readonly you: boolean;
}

function rows(entries: readonly Entry[], playerId: string | null): Row[] {
  return entries.map((entry, index) => ({
    rank: index + 1,
    initials: entry.initials,
    score: entry.score,
    timeMs: entry.timeMs,
    you: playerId !== null && entry.playerId === playerId,
  }));
}

export async function boardOptions(request: Request): Promise<Response> {
  return preflight(request);
}

export async function boardGet(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  const levelId = url.searchParams.get('level') ?? '';

  if (!levelById(levelId)) {
    return error(`unknown level - expected one of ${LEVELS.map((l) => l.id).join(', ')}`, 400, origin);
  }

  const { store } = backend();
  if (!(await store.allow(`read:${clientIp(request)}`, READ_LIMIT.max, READ_LIMIT.windowSeconds))) {
    return error('too many requests', 429, origin);
  }

  const playerId = url.searchParams.get('player');
  const limit = parseLimit(url.searchParams.get('limit'));

  const [entries, players] = await Promise.all([store.top(levelId, limit), store.count(levelId)]);

  // A player outside the top ten still wants to know where they came, so their
  // own standing rides along with the page rather than needing a second call.
  const standing = playerId ? await store.standing(levelId, playerId) : null;

  return json(
    {
      levelId,
      players,
      entries: rows(entries, playerId),
      you: standing
        ? {
            rank: standing.rank,
            initials: standing.entry.initials,
            score: standing.entry.score,
            timeMs: standing.entry.timeMs,
          }
        : null,
    },
    // Only the anonymous board is cacheable: a response carrying one player's
    // standing must never be handed to the next child who asks.
    { origin, ...(playerId ? {} : { cacheSeconds: BOARD_CACHE_SECONDS }) },
  );
}

export async function boardPost(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const parsed = parseSubmission(await readJson(request));
  if (!parsed.ok) return error(parsed.error, 400, origin);

  const { store } = backend();
  if (!(await store.allow(`write:${clientIp(request)}`, WRITE_LIMIT.max, WRITE_LIMIT.windowSeconds))) {
    return error('too many requests', 429, origin);
  }

  const { levelId, ...entry } = parsed.value;
  await store.submit(levelId, entry);

  // Answer with where that run landed, so finishing a level can show a place
  // without a second round trip.
  const standing = await store.standing(levelId, entry.playerId);
  const players = await store.count(levelId);

  return json(
    {
      levelId,
      players,
      you: standing
        ? {
            rank: standing.rank,
            initials: standing.entry.initials,
            score: standing.entry.score,
            timeMs: standing.entry.timeMs,
          }
        : null,
    },
    { origin },
  );
}

/** What running on the memory store costs, said the same way every time. */
const MEMORY_COST = 'Scores are kept in memory and lost when the function restarts.';

/**
 * Why there is no database, in the terms of the fix it needs.
 *
 * Three causes that look identical from the game's side and want completely
 * different things done about them.
 */
function causeOfMemory(restVariables: readonly string[], storageVariables: readonly string[]): string {
  if (restVariables.length > 0) {
    return 'Some REST variables are set but not a complete URL and token pair, so the store is half configured.';
  }
  if (storageVariables.length > 0) {
    return 'A store is attached - the variables above are set - but none of them is a REST pair or a usable redis:// URL, so there is nothing here to connect to.';
  }
  return 'No store variable of any kind reached this function. If one is attached, it is most likely scoped to a different environment than this deployment.';
}

/**
 * Every level's board added together: who is ahead overall.
 *
 * The title screen shows this rather than one level's table, because a single
 * level on the front of the game would be an arbitrary choice, and "who is
 * winning" is the question anyone glancing at a leaderboard is asking.
 */
export async function overallGet(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);

  const { store } = backend();
  if (!(await store.allow(`read:${clientIp(request)}`, READ_LIMIT.max, READ_LIMIT.windowSeconds))) {
    return error('too many requests', 429, origin);
  }

  const playerId = url.searchParams.get('player');
  const board = await store.overall(
    LEVELS.map((level) => level.id),
    playerId,
    parseLimit(url.searchParams.get('limit'), 5),
  );

  return json(
    {
      players: board.players,
      entries: board.entries.map((entry, index) => ({
        rank: index + 1,
        initials: entry.initials,
        score: entry.score,
        levels: entry.levels,
        you: playerId !== null && entry.playerId === playerId,
      })),
      you: board.you
        ? {
            rank: board.you.rank,
            initials: board.you.entry.initials,
            score: board.you.entry.score,
            levels: board.you.entry.levels,
          }
        : null,
    },
    // Same rule as the per-level board: a response carrying one player's
    // standing must never be handed to the next child who asks.
    { origin, ...(playerId ? {} : { cacheSeconds: BOARD_CACHE_SECONDS }) },
  );
}

/**
 * Is the board actually storing anything?
 *
 * Worth its own route: with no database attached the API answers every request
 * perfectly happily and forgets each one, which from the game's side looks
 * identical to nobody having played yet. This is how you tell the difference
 * without reaching for the dashboard.
 */
export async function healthGet(request: Request): Promise<Response> {
  const { persistent, transport } = backend();
  const seen = restVariablesPresent();
  const storageVariablesSeen = storageVariablesPresent();

  return json(
    {
      ok: true,
      storage: persistent ? 'redis' : 'memory',
      // Which way it is reached, because the two fail differently: REST on a
      // bad token, a socket on a firewall or an expired certificate.
      transport,
      // Names only, never values: this route is unauthenticated.
      restVariablesSeen: seen,
      storageVariablesSeen,
      // Two sentences whenever there is no database: what it costs, and why.
      // The consequence is the same every time - scores do not survive - but
      // the cause decides the fix, and they are not guessable from each other.
      note: persistent ? undefined : `${MEMORY_COST} ${causeOfMemory(seen, storageVariablesSeen)}`,
    },
    { origin: request.headers.get('origin') },
  );
}
