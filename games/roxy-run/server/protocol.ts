/**
 * What the store needs from Redis, independent of how it is reached.
 *
 * Two transports implement this: REST over fetch for a store that offers an
 * HTTPS endpoint, and a socket for one that offers only a connection string.
 * The store itself has no idea which it has, which is why adding the second
 * transport changed no storage logic and broke no storage test.
 */

export type Command = readonly (string | number)[];

export interface Redis {
  /** Run one command and return its result. */
  command(args: Command): Promise<unknown>;
  /**
   * Run several in one round trip.
   *
   * Worth having rather than a loop: a submission is three writes, and three
   * sequential trips to a database in another region is most of the time a
   * player spends waiting.
   */
  pipeline(commands: readonly Command[]): Promise<unknown[]>;
}
