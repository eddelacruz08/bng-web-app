import net from 'node:net';

import { decodeMessage, encodeMessage, type JsonMap, type NetMessage } from '../lib/game/protocol';

/** Local-only message type: the socket closed. */
export const DISCONNECTED = '_disconnected';

/** TCP connection from a (web) player to a host, phone or browser-hosted. */
export class LobbyClient {
  private socket: net.Socket | null = null;
  private buffer = '';
  onMessage?: (m: NetMessage) => void;

  get isConnected(): boolean {
    return this.socket != null;
  }

  connect(host: string, port: number, timeoutMs = 6000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      const fail = (e: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(e);
      };
      socket.setTimeout(timeoutMs, () => fail(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
      socket.once('error', fail);
      socket.connect(port, host, () => {
        if (settled) return;
        settled = true;
        socket.setTimeout(0);
        socket.setNoDelay(true);
        socket.setEncoding('utf8');
        socket.removeListener('error', fail);
        this.socket = socket;
        this.buffer = '';
        socket.on('data', (chunk: string) => this.feed(chunk));
        socket.on('close', () => this.onClosed(socket));
        socket.on('error', () => this.onClosed(socket));
        resolve();
      });
    });
  }

  private feed(chunk: string) {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      const m = decodeMessage(line);
      if (m) this.onMessage?.(m);
    }
  }

  private onClosed(socket: net.Socket) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.onMessage?.({ t: DISCONNECTED, d: {} });
  }

  send(t: string, d: JsonMap = {}) {
    try {
      this.socket?.write(encodeMessage(t, d));
    } catch {
      const s = this.socket;
      if (s) this.onClosed(s);
    }
  }

  close() {
    const s = this.socket;
    this.socket = null;
    try {
      s?.destroy();
    } catch {}
  }
}
