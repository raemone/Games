/**
 * The wire protocol, tested without a socket in sight - which is the whole
 * reason encoding and parsing are pure functions.
 */
import { describe, expect, it } from 'vitest';
import { RedisError, encodeCommand, parseReply } from '../../server/resp';

const wire = (text: string): Buffer => Buffer.from(text);

describe('encodeCommand', () => {
  it('writes a command as an array of bulk strings', () => {
    expect(encodeCommand(['GET', 'key']).toString()).toBe('*2\r\n$3\r\nGET\r\n$3\r\nkey\r\n');
  });

  it('sends numbers as strings, which is all Redis accepts', () => {
    expect(encodeCommand(['ZADD', 'k', 42, 'm']).toString()).toBe(
      '*4\r\n$4\r\nZADD\r\n$1\r\nk\r\n$2\r\n42\r\n$1\r\nm\r\n',
    );
  });

  it('counts bytes rather than characters, so a name with an accent survives', () => {
    // Length prefixes are byte counts. Using string length here would frame
    // the value short and desynchronise every reply after it.
    const encoded = encodeCommand(['HSET', 'names', 'RÉM']).toString();
    expect(encoded).toContain('$4\r\nRÉM\r\n');
  });
});

describe('parseReply', () => {
  it('reads each of the RESP types', () => {
    expect(parseReply(wire('+OK\r\n'))?.value).toBe('OK');
    expect(parseReply(wire(':7\r\n'))?.value).toBe(7);
    expect(parseReply(wire('$3\r\nabc\r\n'))?.value).toBe('abc');
    expect(parseReply(wire('*2\r\n$1\r\na\r\n:2\r\n'))?.value).toEqual(['a', 2]);
  });

  it('reads a missing key as null, not as an empty string', () => {
    expect(parseReply(wire('$-1\r\n'))?.value).toBeNull();
    expect(parseReply(wire('*-1\r\n'))?.value).toBeNull();
    // ZMSCORE answers with nulls inside the array for members it lacks.
    expect(parseReply(wire('*2\r\n$-1\r\n$2\r\n60\r\n'))?.value).toEqual([null, '60']);
  });

  it('throws on an error reply rather than returning it as data', () => {
    expect(() => parseReply(wire('-WRONGTYPE nope\r\n'))).toThrow(RedisError);
  });

  it('returns null while a reply is still incomplete', () => {
    // A socket delivers bytes, not messages: every one of these is a real
    // split that arrives in practice, and each must wait rather than guess.
    expect(parseReply(wire('$5\r\nabc'))).toBeNull();
    expect(parseReply(wire('$5\r\nabcde'))).toBeNull();
    expect(parseReply(wire('*2\r\n$1\r\na\r\n'))).toBeNull();
    expect(parseReply(wire('+OK'))).toBeNull();
  });

  it('reports how many bytes it consumed, so the next reply can be found', () => {
    const buffer = wire('+OK\r\n:1\r\n');
    const first = parseReply(buffer);
    expect(first).toEqual({ value: 'OK', length: 5 });
    expect(parseReply(buffer, first?.length)?.value).toBe(1);
  });

  it('handles an empty bulk string, which is not the same as a missing one', () => {
    expect(parseReply(wire('$0\r\n\r\n'))?.value).toBe('');
  });
});
