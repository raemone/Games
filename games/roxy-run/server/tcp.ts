/**
 * Redis over a socket, for a store that hands out a `redis://` URL.
 *
 * The other client here speaks Upstash's REST protocol over fetch, which is
 * the better fit for a serverless function - no connection to keep, no
 * handshake per cold start. But not every managed Redis offers it: the one
 * attached to this project exposes only a connection string, and the choice
 * was between speaking the wire protocol and asking the family to migrate
 * their database. This is the smaller ask.
 *
 * The connection is held at module scope and reused. A warm function instance
 * serves many requests, and reconnecting for each one would add a TCP and TLS
 * handshake to every score a child posts.
 */
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { type Command, type Redis } from './protocol.js';
import { type RespValue, encodeCommand, parseReply } from './resp.js';

/** How long to wait for a connection or a reply before giving up. */
const TIMEOUT_MS = 5000;

export interface TcpConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string | undefined;
  readonly password: string | undefined;
  /** rediss:// means the connection is TLS from the first byte. */
  readonly tls: boolean;
}

/**
 * Read a `redis://` or `rediss://` URL into the parts a socket needs.
 * Returns null for anything unparseable, which falls back to memory rather
 * than crashing the function on a malformed variable.
 */
export function parseRedisUrl(raw: string | undefined): TcpConfig | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') return null;
    const tls = url.protocol === 'rediss:';
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      // A URL with only a password writes it as the username; Redis wants the
      // reverse, so an empty username is normalised away here.
      username: url.username === '' ? undefined : decodeURIComponent(url.username),
      password: url.password === '' ? undefined : decodeURIComponent(url.password),
      tls,
    };
  } catch {
    return null;
  }
}

/** A socket plus the buffer of bytes read from it that are not yet a reply. */
interface Connection {
  readonly socket: Socket;
  pending: Buffer;
  /** Resolvers waiting for replies, in the order their commands were sent. */
  readonly waiting: { resolve: (value: RespValue) => void; reject: (error: unknown) => void }[];
}

export class TcpRedis implements Redis {
  private connection: Connection | null = null;
  /** In flight connect, so concurrent requests share one handshake. */
  private connecting: Promise<Connection> | null = null;

  constructor(private readonly config: TcpConfig) {}

  async command(args: Command): Promise<unknown> {
    const [reply] = await this.send([args]);
    return reply;
  }

  async pipeline(commands: readonly Command[]): Promise<unknown[]> {
    if (commands.length === 0) return [];
    return this.send(commands);
  }

  /**
   * Write every command at once and collect the replies in order.
   *
   * Redis answers a pipeline in the order it was sent, which is the whole
   * reason a queue of resolvers works: reply N belongs to command N, and
   * nothing else has to be tracked.
   */
  private async send(commands: readonly Command[]): Promise<RespValue[]> {
    const connection = await this.connect();
    const replies = commands.map(
      () =>
        new Promise<RespValue>((resolve, reject) => {
          connection.waiting.push({ resolve, reject });
        }),
    );

    connection.socket.write(Buffer.concat(commands.map((args) => encodeCommand(args))));
    return Promise.all(replies);
  }

  private async connect(): Promise<Connection> {
    if (this.connection && !this.connection.socket.destroyed) return this.connection;
    if (this.connecting) return this.connecting;

    this.connecting = this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async open(): Promise<Connection> {
    const { host, port, tls } = this.config;
    const socket = tls
      ? tlsConnect({ host, port, servername: host })
      : netConnect({ host, port });

    socket.setNoDelay(true);
    socket.setTimeout(TIMEOUT_MS);

    const connection: Connection = { socket, pending: Buffer.alloc(0), waiting: [] };

    socket.on('data', (chunk: Buffer) => {
      connection.pending = Buffer.concat([connection.pending, chunk]);
      drain(connection);
    });

    // Any of these ends the connection, and every caller still waiting on a
    // reply has to be told - otherwise the request hangs until the platform
    // kills it, which reads as a timeout rather than a broken database.
    const fail = (error: unknown): void => {
      socket.destroy();
      if (this.connection === connection) this.connection = null;
      while (connection.waiting.length > 0) connection.waiting.shift()?.reject(error);
    };
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('redis connection closed')));
    socket.on('timeout', () => fail(new Error('redis connection timed out')));

    await new Promise<void>((resolve, reject) => {
      socket.once(tls ? 'secureConnect' : 'connect', () => resolve());
      socket.once('error', reject);
    });

    this.connection = connection;

    // AUTH has to be the first command, before anything else is written.
    const { username, password } = this.config;
    if (password !== undefined) {
      const auth: Command = username === undefined ? ['AUTH', password] : ['AUTH', username, password];
      await this.send([auth]);
    }

    return connection;
  }
}

/** Hand every complete reply in the buffer to whoever is next in the queue. */
function drain(connection: Connection): void {
  for (;;) {
    let parsed;
    try {
      parsed = parseReply(connection.pending);
    } catch (error) {
      // A -ERR reply: it belongs to the command at the head of the queue, and
      // the bytes for it have to be dropped or it is parsed again forever.
      const newline = connection.pending.indexOf('\r\n');
      connection.pending = connection.pending.subarray(newline + 2);
      connection.waiting.shift()?.reject(error);
      continue;
    }

    if (!parsed) return;
    connection.pending = connection.pending.subarray(parsed.length);
    connection.waiting.shift()?.resolve(parsed.value);
  }
}
