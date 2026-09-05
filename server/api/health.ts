/**
 * Is the board actually storing anything?
 *
 * Worth a route of its own: with no database attached the API answers every
 * request perfectly happily and forgets each one, which from the game's side
 * looks identical to nobody having played yet. This is how you tell the
 * difference without guessing.
 */
import { backend } from '../src/context';
import { json, preflight } from '../src/http';

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  const { persistent } = backend();
  return json(
    {
      ok: true,
      storage: persistent ? 'redis' : 'memory',
      note: persistent
        ? undefined
        : 'No database attached: scores are kept in memory and lost when the function restarts.',
    },
    { origin: request.headers.get('origin') },
  );
}
