import dgram from 'node:dgram';
import net from 'node:net';

import type { Grid } from '../lib/game/card';
import {
  APP_TAG,
  DISCOVERY_PORT,
  DISCOVERY_QUERY,
  GAME_PORT,
  PROTOCOL_VERSION,
  decodeMessage,
  encodeMessage,
  type JsonMap,
  type NetMessage,
} from '../lib/game/protocol';

/** One connected player socket (a phone running the app, or this server's own web player). */
export class ClientConn {
  name = '';
  clientId = '';
  joined = false;
  waiting = false;
  cardCount = 0;
  lastSeen = Date.now();
  /** Layouts of the cards this player holds, for the lobby-wide uniqueness check. */
  fingerprints = new Set<string>();
  /** The cards themselves, so the dealer can keep new cards' columns different. */
  grids: Grid[] = [];
  private buffer = '';

  constructor(
    readonly id: string,
    readonly socket: net.Socket,
  ) {}

  get address(): string {
    return this.socket.remoteAddress?.replace(/^::ffff:/, '') ?? '';
  }

  /** Splits the TCP stream into newline-delimited messages. */
  feed(chunk: string, onLine: (line: string) => void) {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) onLine(line);
    }
  }
}

/**
 * TCP lobby server plus a UDP responder, speaking exactly the protocol the
 * mobile app uses, so phones join a lobby hosted from the browser the same
 * way they join a phone.
 */
export class HostServer {
  readonly clients = new Map<string, ClientConn>();
  onMessage?: (conn: ClientConn, msg: NetMessage) => void;
  onDisconnect?: (conn: ClientConn) => void;
  discoveryInfo?: () => JsonMap;

  private server: net.Server | null = null;
  private udp: dgram.Socket | null = null;
  private seq = 0;
  private boundPort = GAME_PORT;

  get isRunning(): boolean {
    return this.server != null;
  }

  get port(): number {
    return this.boundPort;
  }

  start(port = GAME_PORT): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.accept(socket));
      server.once('error', (e) => reject(e));
      server.listen(port, '0.0.0.0', () => {
        server.removeAllListeners('error');
        server.on('error', () => {});
        this.server = server;
        const addr = server.address();
        this.boundPort = typeof addr === 'object' && addr ? addr.port : port;
        this.startDiscovery();
        resolve(this.boundPort);
      });
    });
  }

  private startDiscovery() {
    try {
      const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      udp.on('error', () => {
        try {
          udp.close();
        } catch {}
        if (this.udp === udp) this.udp = null;
      });
      udp.on('message', (data, rinfo) => {
        if (data.toString('utf8').trim() !== DISCOVERY_QUERY) return;
        const info = this.discoveryInfo?.() ?? {};
        const reply = JSON.stringify({ app: APP_TAG, v: PROTOCOL_VERSION, port: this.port, ...info });
        udp.send(reply, rinfo.port, rinfo.address);
      });
      udp.bind(DISCOVERY_PORT, () => {
        try {
          udp.setBroadcast(true);
        } catch {}
      });
      this.udp = udp;
    } catch {
      this.udp = null; // discovery is optional; players can still type the address
    }
  }

  private accept(socket: net.Socket) {
    const conn = new ClientConn(`c${++this.seq}`, socket);
    this.clients.set(conn.id, conn);
    socket.setNoDelay(true);
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      conn.lastSeen = Date.now();
      conn.feed(chunk, (line) => {
        const msg = decodeMessage(line);
        if (msg) this.onMessage?.(conn, msg);
      });
    });
    socket.on('close', () => this.drop(conn));
    socket.on('error', () => this.drop(conn));
  }

  private drop(conn: ClientConn, notify = true) {
    if (!this.clients.delete(conn.id)) return;
    try {
      conn.socket.destroy();
    } catch {}
    if (notify) this.onDisconnect?.(conn);
  }

  send(conn: ClientConn, t: string, d: JsonMap = {}) {
    try {
      conn.socket.write(encodeMessage(t, d));
    } catch {
      this.drop(conn);
    }
  }

  broadcast(t: string, d: JsonMap = {}, joinedOnly = true) {
    for (const c of [...this.clients.values()]) {
      if (joinedOnly && !c.joined) continue;
      this.send(c, t, d);
    }
  }

  kick(conn: ClientConn, reason?: { t: string; d: JsonMap }, silent = false) {
    if (reason) this.send(conn, reason.t, reason.d);
    this.drop(conn, !silent);
  }

  async stop() {
    for (const c of [...this.clients.values()]) {
      try {
        c.socket.destroy();
      } catch {}
    }
    this.clients.clear();
    try {
      this.udp?.close();
    } catch {}
    this.udp = null;
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
  }
}
