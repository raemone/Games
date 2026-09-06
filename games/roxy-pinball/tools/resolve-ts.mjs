// The game's own imports are extensionless, which is what Vite and TypeScript
// expect but Node's ESM resolver does not. These two files let the offline
// tools import the game's source directly instead of keeping a second copy of
// the table's geometry that could drift out of step with the real one.
import { register } from 'node:module';
register('./resolve-ts-hooks.mjs', import.meta.url);
