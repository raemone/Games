/**
 * The storage layer over a real socket.
 *
 * The store's own tests use the in-memory implementation, and the socket's
 * tests use canned replies; this is the seam between them - the commands the
 * store actually puts on the wire, and what it makes of a realistic answer.
 * Getting an argument order wrong (`ZADD key GT CH score member`) is invisible
 * to both of the other test files and fatal in production.
 */
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RedisStore } from '../../server/store';
import { TcpRedis } from '../../server/tcp';

let server: Server;
let sockets: Socket[] = [];
let received: string[] = [];
let replies: string[] = [];
let store: RedisStore;

beforeEach(async () => {
  received = [];
  replies = [];
  sockets = [];

  server = createServer((socket) => {
    sockets.push(socket);
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => {
      const text = chunk.toString();
      received.push(text);
      for (let i = 0; i < text.split('*').length - 1; i++) {
        socket.write(replies.shift() ?? '+OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  store = new RedisStore(
    new TcpRedis({ host: '127.0.0.1', port, username: undefined, password: undefined, tls: false }),
  );
});

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const sent = (): string => received.join('');

describe('RedisStore over a socket', () => {
  it('keeps the best of each with GT and LT, in one round trip', async () => {
    replies = [':1\r\n', ':1\r\n', ':1\r\n'];
    await store.submit('w1-1', { playerId: 'a'.repeat(16), initials: 'ROX', score: 4200, timeMs: 61_000 });

    const wire = sent();
    // GT for the score (higher wins), LT for the time (lower wins). Swapping
    // these silently keeps the worst of every run instead of the best.
    expect(wire).toContain('ZADD');
    expect(wire).toContain('GT');
    expect(wire).toContain('LT');
    expect(wire.indexOf('GT')).toBeLessThan(wire.indexOf('LT'));
    expect(wire).toContain('HSET');
    // One write to the socket means one round trip for all three commands.
    expect(received).toHaveLength(1);
  });

  it('reads a board out of the three replies that make it up', async () => {
    replies = [
      // ZRANGE ... REV WITHSCORES: member, score, member, score
      '*4\r\n$16\r\naaaaaaaaaaaaaaaa\r\n$4\r\n9000\r\n$16\r\nbbbbbbbbbbbbbbbb\r\n$3\r\n100\r\n',
      // HMGET names, then ZMSCORE times - both in one pipeline
      '*2\r\n$3\r\nRAE\r\n$3\r\nROX\r\n',
      '*2\r\n$5\r\n40000\r\n$5\r\n61000\r\n',
    ];

    expect(await store.top('w1-1', 10)).toEqual([
      { playerId: 'a'.repeat(16), initials: 'RAE', score: 9000, timeMs: 40_000 },
      { playerId: 'b'.repeat(16), initials: 'ROX', score: 100, timeMs: 61_000 },
    ]);
  });

  it('treats an empty board as empty rather than asking for names', async () => {
    replies = ['*0\r\n'];
    expect(await store.top('w1-1', 10)).toEqual([]);
    // No second round trip: there is nobody to look up.
    expect(received).toHaveLength(1);
  });

  it('turns a rank of zero into first place, not a missing player', async () => {
    // ZREVRANK is 0-based, and 0 is falsy - the classic way this reads as "no
    // standing" and a leader vanishes from their own board.
    // Four commands in the pipeline, so four separate replies: over a socket
    // Redis answers each one in turn, unlike the REST endpoint's single array.
    replies = [':0\r\n', '$4\r\n9000\r\n', '$5\r\n40000\r\n', '$3\r\nRAE\r\n'];
    expect(await store.standing('w1-1', 'a'.repeat(16))).toEqual({
      rank: 1,
      entry: { playerId: 'a'.repeat(16), initials: 'RAE', score: 9000, timeMs: 40_000 },
    });
  });

  it('has no standing for a player the database does not know', async () => {
    replies = ['$-1\r\n', '$-1\r\n', '$-1\r\n', '$-1\r\n'];
    expect(await store.standing('w1-1', 'f'.repeat(16))).toBeNull();
  });

  it('counts a rate-limit window and expires it', async () => {
    replies = [':1\r\n', ':1\r\n'];
    expect(await store.allow('ip', 20, 60)).toBe(true);
    expect(sent()).toContain('INCR');
    expect(sent()).toContain('EXPIRE');
  });

  it('refuses once the window is used up', async () => {
    replies = [':21\r\n', ':1\r\n'];
    expect(await store.allow('ip', 20, 60)).toBe(false);
  });
});
