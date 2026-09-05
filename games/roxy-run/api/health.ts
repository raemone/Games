/**
 * Is the board actually storing anything?
 *
 * Worth a route of its own: with no database attached the API answers every
 * request perfectly happily and forgets each one, which from the game's side
 * looks identical to nobody having played yet. This is how you tell the
 * difference without guessing.
 */
import { backend } from '../server/context';
import { json, preflight } from '../server/http';
import { restVariablesPresent } from '../server/redis';

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  const { persistent } = backend();
  const seen = restVariablesPresent();

  return json(
    {
      ok: true,
      storage: persistent ? 'redis' : 'memory',
      // Names only, never values: this route is unauthenticated.
      restVariablesSeen: seen,
      note: persistent
        ? undefined
        : seen.length === 0
          ? 'No database attached: scores are kept in memory and lost when the function restarts. If a Redis store is attached, check it exposes the REST variables - a redis:// connection string alone cannot be used from here.'
          : 'A database is half configured: some REST variables are set but not a complete URL and token pair.',
    },
    { origin: request.headers.get('origin') },
  );
}
