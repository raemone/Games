/**
 * The environment, as the API sees it.
 *
 * A named type rather than reaching for `process.env` directly at each call
 * site: every function that reads configuration takes an `Env`, so a test can
 * hand it a plain object instead of mutating the real environment.
 */

/** Process environment: every variable is a string, or absent. */
export type Env = Readonly<Record<string, string | undefined>>;

/** The live environment. */
export function currentEnv(): Env {
  return process.env;
}
