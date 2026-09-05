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
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Not a TypeScript module after all; fall through to the default.
    }
  }
  return next(specifier, context);
}
