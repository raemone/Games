/**
 * Let Node import `./context` and find `./context.ts`.
 *
 * Node's own TypeScript support resolves specifiers exactly as written, but
 * the source here is written the way the rest of this repository is - without
 * file extensions - because that is what TypeScript and every bundler expect.
 * This hook bridges the two for the local dev server only; nothing in the
 * deployed function goes near it.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    // Both the shapes a bundler would resolve: the module itself, and a
    // directory's index. The game imports `../src/levels`, which is the
    // second, so missing it breaks the API rather than just the dev server.
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await next(candidate, context);
      } catch {
        // Try the next shape, then fall through to Node's own resolution.
      }
    }
  }
  return next(specifier, context);
}
