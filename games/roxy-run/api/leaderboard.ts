/**
 * The world board's route: /api/leaderboard.
 *
 * Deliberately almost empty. Everything it does lives in `server/routes.ts`,
 * loaded here inside a try/catch, because a serverless function that fails
 * while *loading* cannot report anything itself - the platform answers with a
 * generic crash page and the reason is only in a dashboard the person hitting
 * the URL may not be able to open. Paying one dynamic import for an error
 * anybody can read is worth it.
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
    const { boardGet } = await import('../server/routes.js');
    return await boardGet(request);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { boardPost } = await import('../server/routes.js');
    return await boardPost(request);
  } catch (error) {
    return failure(error);
  }
}
