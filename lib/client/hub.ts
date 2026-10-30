'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { DiscoveredLobby, HostSnapshot, HubEvent, PlayerSnapshot } from '@/lib/game/types';
import { getClientId } from './identity';

type Listener = (ev: HubEvent) => void;

/**
 * The browser's end of the live-state WebSocket. Reconnects by itself,
 * re-subscribes after a drop, and queues commands sent while offline.
 */
class HubClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private connListeners = new Set<() => void>();
  private subs = new Map<string, number>();
  private queue: string[] = [];
  private retry: ReturnType<typeof setTimeout> | null = null;
  connected = false;

  ensure() {
    if (this.ws || typeof window === 'undefined') return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      ws.send(JSON.stringify({ t: 'hello', d: { clientId: getClientId() } }));
      for (const slot of this.subs.keys()) ws.send(JSON.stringify({ t: 'sub', d: { slot } }));
      for (const q of this.queue) ws.send(q);
      this.queue = [];
      for (const l of this.connListeners) l();
    };
    ws.onmessage = (e) => {
      let ev: HubEvent;
      try {
        ev = JSON.parse(String(e.data));
      } catch {
        return;
      }
      for (const l of this.listeners) l(ev);
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.connected = false;
      for (const l of this.connListeners) l();
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => this.ensure(), 1500);
    };
    ws.onerror = () => ws.close();
  }

  send(t: string, d: Record<string, unknown> = {}) {
    const s = JSON.stringify({ t, d });
    this.ensure();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else this.queue.push(s);
  }

  subscribe(slot: string) {
    this.subs.set(slot, (this.subs.get(slot) ?? 0) + 1);
    this.send('sub', { slot });
  }

  unsubscribe(slot: string) {
    const n = (this.subs.get(slot) ?? 1) - 1;
    if (n <= 0) {
      this.subs.delete(slot);
      this.send('unsub', { slot });
    } else {
      this.subs.set(slot, n);
    }
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onConnection(l: () => void): () => void {
    this.connListeners.add(l);
    return () => this.connListeners.delete(l);
  }
}

let instance: HubClient | null = null;

export function hub(): HubClient {
  return (instance ??= new HubClient());
}

/** Runs [handler] for every hub event; the latest handler is always used. */
export function useHubEvents(handler: Listener) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const h = hub();
    h.ensure();
    return h.on((ev) => ref.current(ev));
  }, []);
}

export function useHubConnected(): boolean {
  const h = typeof window === 'undefined' ? null : hub();
  return useSyncExternalStore(
    (cb) => (h ? h.onConnection(cb) : () => {}),
    () => h?.connected ?? false,
    () => false,
  );
}

/** Live snapshot of the browser-hosted lobby or the Ball Caller desk. `undefined` until the server answers. */
export function useDeskState(slot: 'host' | 'caller'): HostSnapshot | null | undefined {
  const [state, setState] = useState<HostSnapshot | null | undefined>(undefined);
  useEffect(() => {
    const h = hub();
    const off = h.on((ev) => {
      if (ev.t === (slot === 'host' ? 'host_state' : 'caller_state')) setState(ev.d as HostSnapshot | null);
    });
    h.subscribe(slot);
    return () => {
      off();
      h.unsubscribe(slot);
    };
  }, [slot]);
  return state;
}

/** Live snapshot of this browser's player, or null when it is not in a game. */
export function usePlayerState(): PlayerSnapshot | null | undefined {
  const [state, setState] = useState<PlayerSnapshot | null | undefined>(undefined);
  useEffect(() => {
    const h = hub();
    const off = h.on((ev) => {
      if (ev.t === 'player_state') setState(ev.d);
    });
    h.subscribe('player');
    return () => {
      off();
      h.unsubscribe('player');
    };
  }, []);
  return state;
}

/** Lobbies the server can see on the local network (UDP discovery). */
export function useLobbies(): { lobbies: DiscoveredLobby[]; error: string | null } {
  const [lobbies, setLobbies] = useState<DiscoveredLobby[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const h = hub();
    const off = h.on((ev) => {
      if (ev.t === 'lobbies') setLobbies(ev.d);
      else if (ev.t === 'error' && /lobby search/i.test(ev.d.message)) setError(ev.d.message);
    });
    h.subscribe('lobbies');
    return () => {
      off();
      h.unsubscribe('lobbies');
    };
  }, []);
  return { lobbies, error };
}
