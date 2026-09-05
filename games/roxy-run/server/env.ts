/**
 * The environment, without a dependency on Node's type definitions.
 *
 * The functions in `api/` run on Node and read `process.env`, but they live in
 * the game's package, which is a browser package. Pulling @types/node in here
 * to describe four environment variables would put Node's globals in scope for
 * every game file too - and quietly change what `setTimeout` returns. Four
 * lines is the cheaper trade.
 */

/** Process environment: every variable is a string, or absent. */
export type Env = Readonly<Record<string, string | undefined>>;

declare const process: { readonly env: Env };

/** The live environment, read through the one declaration above. */
export function currentEnv(): Env {
  return process.env;
}
