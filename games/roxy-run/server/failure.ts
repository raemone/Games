/**
 * The last resort: turning a crash into something a person can read.
 *
 * Every route wraps itself in this. Without it a function that throws while
 * loading - a module that did not resolve, a bad import - reaches the player
 * as an opaque platform error page, and the actual reason is only visible in
 * the deployment dashboard.
 *
 * It reports the error's name and message but never its stack. The message
 * names a module or a missing variable, which is what makes it worth showing;
 * a stack adds paths and internals without adding an answer.
 */

export function failure(error: unknown): Response {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : `threw ${typeof error}: ${String(error)}`;

  return new Response(
    JSON.stringify({
      error: 'The leaderboard function failed to start.',
      detail,
    }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        // A crash is still cross-origin: without this the game sees an opaque
        // network error rather than the sentence above.
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
