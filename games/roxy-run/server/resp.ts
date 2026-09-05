/**
 * RESP, the protocol Redis speaks over a socket, as two pure functions.
 *
 * The store attached to this project hands out a `redis://` URL rather than
 * the REST endpoint the other client uses, and reaching that means speaking
 * the wire protocol. RESP2 is small enough to write correctly: five types, all
 * length-prefixed, no framing surprises.
 *
 * Pure and synchronous on purpose - encoding and parsing are where a protocol
 * gets subtly wrong, so they are testable without a socket anywhere near them.
 */

/** A value Redis can send back. Arrays nest; null is a missing key. */
export type RespValue = string | number | null | RespValue[];

/** Encode one command as a RESP array of bulk strings, which is all Redis accepts. */
export function encodeCommand(args: readonly (string | number)[]): Buffer {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(String(arg));
    parts.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from('\r\n'));
  }
  return Buffer.concat(parts);
}

/** A parsed value, and how many bytes of the buffer it consumed. */
export interface Parsed {
  readonly value: RespValue;
  readonly length: number;
}

/** Raised for a Redis `-ERR ...` reply, so a failed command throws rather than returning junk. */
export class RedisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisError';
  }
}

/**
 * Parse one reply from the front of a buffer.
 *
 * Returns null when the buffer does not yet hold a complete reply - a socket
 * delivers bytes, not messages, and a reply can arrive in pieces. The caller
 * keeps reading and tries again rather than guessing.
 */
export function parseReply(buffer: Buffer, start = 0): Parsed | null {
  const end = buffer.indexOf('\r\n', start);
  if (end < 0) return null;

  const type = String.fromCharCode(buffer[start] ?? 0);
  const head = buffer.toString('utf8', start + 1, end);
  const headerLength = end + 2 - start;

  switch (type) {
    case '+':
      return { value: head, length: headerLength };

    case '-':
      throw new RedisError(head);

    case ':':
      return { value: Number(head), length: headerLength };

    case '$': {
      const size = Number(head);
      // -1 is the null bulk string: a key that does not exist.
      if (size < 0) return { value: null, length: headerLength };
      const from = start + headerLength;
      const to = from + size;
      // The trailing CRLF has to be present too, or the reply is incomplete.
      if (buffer.length < to + 2) return null;
      return { value: buffer.toString('utf8', from, to), length: to + 2 - start };
    }

    case '*': {
      const count = Number(head);
      if (count < 0) return { value: null, length: headerLength };
      const items: RespValue[] = [];
      let offset = start + headerLength;
      for (let i = 0; i < count; i++) {
        const item = parseReply(buffer, offset);
        if (!item) return null;
        items.push(item.value);
        offset += item.length;
      }
      return { value: items, length: offset - start };
    }

    default:
      throw new RedisError(`unexpected reply type ${JSON.stringify(type)}`);
  }
}
