import dgram from 'node:dgram';

import { APP_TAG, DISCOVERY_PORT, DISCOVERY_QUERY, GAME_PORT } from '../lib/game/protocol';
import type { DiscoveredLobby } from '../lib/game/types';
import { broadcastFor, lanInterfaces, sweepTargets } from './lan';

/**
 * Finds lobbies on the local network the way the phones do: a broadcast
 * query every two seconds, plus a direct query to every address on the
 * network every other cycle (many routers drop broadcasts between devices).
 */
export class LobbyDiscovery {
  private sock: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private cycle = 0;
  private sweep: string[] = [];
  private broadcasts: string[] = ['255.255.255.255'];
  private found = new Map<string, DiscoveredLobby>();
  onChange?: (lobbies: DiscoveredLobby[]) => void;

  get current(): DiscoveredLobby[] {
    return [...this.found.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  start(): Promise<void> {
    if (this.sock) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.once('error', reject);
      sock.on('message', (data, rinfo) => this.handleReply(data, rinfo.address));
      sock.bind(0, () => {
        sock.removeListener('error', reject);
        sock.on('error', () => {});
        try {
          sock.setBroadcast(true);
        } catch {}
        this.sock = sock;
        this.loadTargets();
        this.timer = setInterval(() => this.query(), 2000);
        this.query();
        resolve();
      });
    });
  }

  private loadTargets() {
    const targets = new Set<string>(['255.255.255.255']);
    let sweep: string[] = [];
    for (const i of lanInterfaces()) {
      targets.add(broadcastFor(i.ip, i.prefix));
      targets.add(i.ip); // a lobby hosted on this very computer answers on its own address
      if (sweep.length === 0) sweep = sweepTargets(i.ip, i.prefix);
    }
    targets.add('127.0.0.1');
    this.broadcasts = [...targets];
    this.sweep = sweep;
  }

  private handleReply(data: Buffer, address: string) {
    try {
      const j = JSON.parse(data.toString('utf8'));
      if (!j || j.app !== APP_TAG) return;
      const lobby: DiscoveredLobby = {
        host: address,
        port: Number(j.port) || GAME_PORT,
        name: String(j.name ?? 'Bingo Lobby'),
        hostName: String(j.hostName ?? 'Host'),
        code: String(j.code ?? ''),
        status: String(j.status ?? 'lobby'),
        playerCount: Number(j.players) || 0,
        seenAt: new Date().toISOString(),
      };
      // The same lobby answers on every address it has (and on loopback when
      // it is hosted on this very computer): keep one entry, preferring the
      // address other devices can also reach.
      const key = `${lobby.code}|${lobby.port}|${lobby.name}|${lobby.hostName}`;
      const existing = this.found.get(key);
      if (existing && lobby.host.startsWith('127.') && !existing.host.startsWith('127.')) lobby.host = existing.host;
      this.found.set(key, lobby);
      this.emit();
    } catch {}
  }

  private query() {
    const sock = this.sock;
    if (!sock) return;
    const data = Buffer.from(DISCOVERY_QUERY, 'utf8');
    for (const t of this.broadcasts) {
      try {
        sock.send(data, DISCOVERY_PORT, t);
      } catch {}
    }
    if (this.cycle++ % 2 === 0) {
      for (const t of this.sweep) {
        try {
          sock.send(data, DISCOVERY_PORT, t);
        } catch {}
      }
    }
    const cutoff = Date.now() - 10_000;
    let changed = false;
    for (const [k, l] of this.found) {
      if (Date.parse(l.seenAt) < cutoff) {
        this.found.delete(k);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private emit() {
    this.onChange?.(this.current);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.sock?.close();
    } catch {}
    this.sock = null;
    this.found.clear();
  }
}
