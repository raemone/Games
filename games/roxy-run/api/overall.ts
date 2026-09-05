/**
 * Every level's board added together: /api/overall.
 *
 * A wrapper around `server/routes.ts`, for the reason given in
 * `leaderboard.ts` - a function that fails while loading cannot report
 * anything itself.
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
    const { overallGet } = await import('../server/routes.js');
    return await overallGet(request);
  } catch (error) {
    return failure(error);
  }
}
