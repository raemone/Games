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
  if (specifier.startsWith('.')) {
    // The source imports `./thing.js`, which is what the compiled function
    // ships and what Node needs to see. Here nothing is compiled, so the file
    // on disk is `./thing.ts`. Extensionless and directory forms are tried too,
    // for anything written the bundler-ish way.
    const candidates = specifier.endsWith('.js')
      ? [`${specifier.slice(0, -3)}.ts`]
      : [`${specifier}.ts`, `${specifier}/index.ts`];

    for (const candidate of candidates) {
      try {
        return await next(candidate, context);
      } catch {
        // Try the next shape, then fall through to Node's own resolution.
      }
    }
  }
  return next(specifier, context);
}
