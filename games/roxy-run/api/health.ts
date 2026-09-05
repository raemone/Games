/**
 * Whether the board is really storing anything: /api/health.
 *
 * A wrapper around `server/routes.ts`, for the reason given in
 * `leaderboard.ts`. This is the route someone opens when the board is
 * misbehaving, so it is the last one that should answer with a crash page
 * instead of a sentence.
 */
import { failure } from '../server/failure.js';

export async function OPTIONS(request: Request): Promise<Response> {
  try {
    const { boardOptions } = await import('../server/routes.js');
    return await boardOptions(request);
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { healthGet } = await import('../server/routes.js');
    return await healthGet(request);
  } catch (error) {
    return failure(error);
  }
}
