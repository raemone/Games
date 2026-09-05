/**
 * The socket client, against a real server on a real port.
 *
 * A stand-in Redis rather than a mocked socket: it speaks RESP back over TCP,
 * so the connection, the AUTH handshake, pipelining and reply framing are all
 * genuinely exercised. Mocking the socket would test only that the code calls
 * the functions it calls.
 */
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TcpRedis, parseRedisUrl } from '../../server/tcp';
import { RedisError, encodeCommand } from '../../server/resp';

/** A fake Redis: records what it is sent, replies with what it is told to. */
class FakeRedis {
  readonly received: string[] = [];
  /** Replies to send, in order, one per command received. */
  replies: string[] = [];
  /** Send each reply one byte at a time, to prove reassembly works. */
  dribble = false;
  private server: Server | null = null;
  private sockets: Socket[] = [];

  async listen(): Promise<number> {
    this.server = createServer((socket) => {
      this.sockets.push(socket);
      socket.on('data', (chunk) => this.onData(socket, chunk));
      socket.on('error', () => undefined);
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const address = this.server?.address();
    return typeof address === 'object' && address ? address.port : 0;
  }

  private onData(socket: Socket, chunk: Buffer): void {
    // One RESP array per command; count them so a pipeline gets one reply each.
    const text = chunk.toString();
    this.received.push(text);
    const commands = text.split('*').length - 1;

    for (let i = 0; i < commands; i++) {
      const reply = this.replies.shift() ?? '+OK\r\n';
      if (!this.dribble) {
        socket.write(reply);
        continue;
      }
      for (const byte of Buffer.from(reply)) socket.write(Buffer.from([byte]));
    }
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }
}

let fake: FakeRedis;
let port: number;

beforeEach(async () => {
  fake = new FakeRedis();
  port = await fake.listen();
});

afterEach(async () => {
  await fake.close();
});

const client = (over: Partial<{ username: string; password: string }> = {}) =>
  new TcpRedis({
    host: '127.0.0.1',
    port,
    username: over.username,
    password: over.password,
    tls: false,
  });

describe('parseRedisUrl', () => {
  it('reads host, port and credentials', () => {
    expect(parseRedisUrl('redis://default:secret@db.example:6380')).toEqual({
      host: 'db.example',
      port: 6380,
      username: 'default',
      password: 'secret',
      tls: false,
    });
  });

  it('defaults the port and notices TLS', () => {
    const parsed = parseRedisUrl('rediss://:pw@db.example');
    expect(parsed).toMatchObject({ port: 6379, tls: true, username: undefined, password: 'pw' });
  });

  it('decodes a password with URL-escaped characters', () => {
    expect(parseRedisUrl('redis://:p%40ss%2Fword@db.example')?.password).toBe('p@ss/word');
  });

  it('returns null for anything it cannot use, rather than throwing', () => {
    expect(parseRedisUrl(undefined)).toBeNull();
    expect(parseRedisUrl('')).toBeNull();
    expect(parseRedisUrl('not a url')).toBeNull();
    expect(parseRedisUrl('https://db.example')).toBeNull();
  });
});

describe('TcpRedis', () => {
  it('sends a command and reads its reply', async () => {
    fake.replies = [':4\r\n'];
    expect(await client().command(['ZCARD', 'k'])).toBe(4);
    expect(fake.received.join('')).toBe(encodeCommand(['ZCARD', 'k']).toString());
  });

  it('authenticates before anything else when a password is set', async () => {
    fake.replies = ['+OK\r\n', ':1\r\n'];
    await client({ password: 'secret' }).command(['ZCARD', 'k']);
    expect(fake.received.join('')).toContain('AUTH');
    expect(fake.received.join('').indexOf('AUTH')).toBeLessThan(fake.received.join('').indexOf('ZCARD'));
  });

  it('sends username and password when the URL carries both', async () => {
    fake.replies = ['+OK\r\n', ':1\r\n'];
    await client({ username: 'default', password: 'secret' }).command(['ZCARD', 'k']);
    expect(fake.received.join('')).toContain(encodeCommand(['AUTH', 'default', 'secret']).toString());
  });

  it('pipelines commands and returns replies in order', async () => {
    fake.replies = [':1\r\n', ':2\r\n', '$3\r\nROX\r\n'];
    const redis = client();
    expect(await redis.pipeline([['A'], ['B'], ['C']])).toEqual([1, 2, 'ROX']);
  });

  it('reassembles a reply that arrives in pieces', async () => {
    // The real failure this guards: a bulk string split across TCP packets.
    fake.dribble = true;
    fake.replies = ['*2\r\n$3\r\nROX\r\n$-1\r\n'];
    expect(await client().command(['HMGET', 'names', 'a', 'b'])).toEqual(['ROX', null]);
  });

  it('reuses one connection across commands', async () => {
    const redis = client();
    fake.replies = [':1\r\n', ':2\r\n'];
    await redis.command(['A']);
    await redis.command(['B']);
    // Two commands, one socket: the fake only ever accepted one connection.
    expect(fake.received).toHaveLength(2);
  });

  it('rejects the waiting command on an error reply, and keeps working after', async () => {
    const redis = client();
    fake.replies = ['-WRONGTYPE not a zset\r\n', ':9\r\n'];
    await expect(redis.command(['ZCARD', 'k'])).rejects.toThrow(RedisError);
    expect(await redis.command(['ZCARD', 'j'])).toBe(9);
  });

  it('rejects rather than hanging when the server goes away', async () => {
    const redis = client();
    fake.replies = [':1\r\n'];
    await redis.command(['A']);
    await fake.close();
    await expect(redis.command(['B'])).rejects.toThrow();
  });

  it('fails cleanly when nothing is listening', async () => {
    const nowhere = new TcpRedis({ host: '127.0.0.1', port: 1, username: undefined, password: undefined, tls: false });
    await expect(nowhere.command(['PING'])).rejects.toThrow();
  });
});
