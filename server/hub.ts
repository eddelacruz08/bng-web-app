import type { WebSocket } from 'ws';

import { PATTERN_LIST, type WinPattern } from '../lib/game/pattern';
import { isValidHost } from '../lib/game/protocol';
import type { HubEvent } from '../lib/game/types';
import { LobbyDiscovery } from './discovery';
import { HostController } from './hostController';
import { PlayerController } from './playerController';
import { store } from './store';

type Slot = 'host' | 'caller';
type Cmd = Record<string, unknown>;

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

interface WsClient {
  ws: WebSocket;
  clientId: string;
  subs: Set<string>;
}

/**
 * One hub per server process: the browser-hosted lobby (at most one), the
 * Ball Caller desk (at most one), every web player (one per browser), lobby
 * discovery, and the WebSocket connections that watch them. Browsers send
 * commands; the hub answers with full state snapshots and events.
 */
class Hub {
  host: HostController | null = null;
  caller: HostController | null = null;
  readonly players = new Map<string, PlayerController>();
  private discovery: LobbyDiscovery | null = null;
  private discoveryStop: NodeJS.Timeout | null = null;
  private readonly clients = new Set<WsClient>();

  attach(ws: WebSocket) {
    const client: WsClient = { ws, clientId: '', subs: new Set() };
    this.clients.add(client);
    ws.on('message', (raw) => {
      let msg: { t?: unknown; d?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      const d = msg.d && typeof msg.d === 'object' ? (msg.d as Cmd) : {};
      this.handle(client, msg.t, d).catch((e: unknown) => {
        this.send(client, { t: 'error', d: { message: e instanceof Error ? e.message : String(e) } });
      });
    });
    ws.on('close', () => {
      this.clients.delete(client);
      this.maybeStopDiscovery();
    });
    ws.on('error', () => {});
  }

  // ---------------------------------------------------------------- plumbing

  private send(client: WsClient, ev: HubEvent) {
    if (client.ws.readyState === client.ws.OPEN) client.ws.send(JSON.stringify(ev));
  }

  private broadcastSlot(slot: string, ev: HubEvent) {
    for (const c of this.clients) if (c.subs.has(slot)) this.send(c, ev);
  }

  private sendToClientId(clientId: string, ev: HubEvent) {
    for (const c of this.clients) if (c.clientId === clientId) this.send(c, ev);
  }

  private controller(slot: Slot): HostController | null {
    return slot === 'caller' ? this.caller : this.host;
  }

  private setController(slot: Slot, c: HostController | null) {
    if (slot === 'caller') this.caller = c;
    else this.host = c;
  }

  private stateEvent(slot: Slot): HubEvent {
    const c = this.controller(slot);
    const d = c && !c.disposed ? c.snapshot() : null;
    return slot === 'caller' ? { t: 'caller_state', d } : { t: 'host_state', d };
  }

  private playerState(clientId: string): HubEvent {
    const p = this.players.get(clientId);
    return { t: 'player_state', d: p && !p.disposed ? p.snapshot() : null };
  }

  private wire(slot: Slot, c: HostController) {
    c.events = {
      onChange: () => this.broadcastSlot(slot, this.stateEvent(slot)),
      onToast: (message) => this.broadcastSlot(slot, { t: 'toast', d: { message, slot } }),
      onWin: (winner) => this.broadcastSlot(slot, { t: 'win', d: { slot, winner } }),
      onNumber: (value) => this.broadcastSlot(slot, { t: 'number', d: { slot, value } }),
    };
  }

  private wirePlayer(p: PlayerController) {
    const to = (ev: HubEvent) => this.sendToClientId(p.clientId, ev);
    p.events = {
      onChange: () => to({ t: 'player_state', d: p.snapshot() }),
      onToast: (message) => to({ t: 'toast', d: { message, slot: 'player' } }),
      onWin: (winner) => to({ t: 'win', d: { slot: 'player', winner } }),
      onAutoBingo: (card) => to({ t: 'auto_bingo', d: { card } }),
      onClaimRejected: (reason) => to({ t: 'claim_rejected', d: { reason } }),
      onNumber: (value) => to({ t: 'number', d: { slot: 'player', value } }),
    };
  }

  private async startDiscovery() {
    if (this.discoveryStop) {
      clearTimeout(this.discoveryStop);
      this.discoveryStop = null;
    }
    if (this.discovery) return;
    const d = new LobbyDiscovery();
    d.onChange = (lobbies) => this.broadcastSlot('lobbies', { t: 'lobbies', d: lobbies });
    this.discovery = d;
    try {
      await d.start();
    } catch (e) {
      this.discovery = null;
      throw new Error(`Automatic lobby search is unavailable (${e instanceof Error ? e.message : e}). Type the host address instead.`);
    }
  }

  private maybeStopDiscovery() {
    if (!this.discovery) return;
    for (const c of this.clients) if (c.subs.has('lobbies')) return;
    if (this.discoveryStop) clearTimeout(this.discoveryStop);
    this.discoveryStop = setTimeout(() => {
      for (const c of this.clients) if (c.subs.has('lobbies')) return;
      this.discovery?.stop();
      this.discovery = null;
      this.discoveryStop = null;
    }, 2000);
  }

  private async openController(client: WsClient, slot: Slot, c: HostController) {
    this.wire(slot, c);
    this.setController(slot, c);
    client.subs.add(slot);
    try {
      await c.start();
    } catch {
      this.send(client, { t: 'error', d: { message: c.error ?? 'Could not open the lobby.' } });
      this.broadcastSlot(slot, this.stateEvent(slot));
      c.dispose();
      this.setController(slot, null);
      this.broadcastSlot(slot, this.stateEvent(slot));
    }
  }

  private async closeController(slot: Slot, result: 'saved' | 'ended') {
    const c = this.controller(slot);
    if (!c) return;
    if (result === 'saved') await c.stopAndSave();
    else await c.endSession();
    c.dispose();
    this.setController(slot, null);
    this.broadcastSlot(slot, { t: 'closed', d: { slot, result } });
    this.broadcastSlot(slot, this.stateEvent(slot));
  }

  private joinAs(client: WsClient, args: { host: string; port: number; name: string; autoDaub: boolean }) {
    if (!client.clientId) throw new Error('Say hello first.');
    if (!isValidHost(args.host)) throw new Error('Enter a valid host address (IPv4 or a name like bingo.fly.dev).');
    if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) throw new Error('Port must be 1 to 65535.');
    if (args.name.trim().length < 2) throw new Error('Pick a player name first.');
    const existing = this.players.get(client.clientId);
    if (existing) {
      existing.leave();
      existing.dispose();
    }
    const p = new PlayerController({
      clientId: client.clientId,
      playerName: args.name.trim(),
      host: args.host.trim(),
      port: args.port,
      autoDaub: args.autoDaub,
    });
    this.players.set(client.clientId, p);
    this.wirePlayer(p);
    client.subs.add('player');
    void p.connect();
  }

  // ---------------------------------------------------------------- commands

  async handle(client: WsClient, t: string, d: Cmd) {
    const slot: Slot = d.slot === 'caller' ? 'caller' : 'host';
    const pattern = (): WinPattern => {
      const p = str(d.pattern);
      return (PATTERN_LIST as string[]).includes(p) ? (p as WinPattern) : 'straightDiagonal';
    };
    switch (t) {
      case 'hello': {
        client.clientId = str(d.clientId).slice(0, 64);
        this.send(client, { t: 'hello', d: { clientId: client.clientId } });
        return;
      }
      case 'sub': {
        const s = str(d.slot);
        client.subs.add(s);
        if (s === 'host' || s === 'caller') this.send(client, this.stateEvent(s));
        else if (s === 'player') this.send(client, this.playerState(client.clientId));
        else if (s === 'lobbies') {
          try {
            await this.startDiscovery();
            this.send(client, { t: 'lobbies', d: this.discovery?.current ?? [] });
          } catch (e) {
            this.send(client, { t: 'error', d: { message: e instanceof Error ? e.message : String(e) } });
          }
        }
        return;
      }
      case 'unsub': {
        client.subs.delete(str(d.slot));
        this.maybeStopDiscovery();
        return;
      }

      // ------------------------------------------------ host / Ball Caller
      case 'host_open': {
        const existing = this.controller(slot);
        if (existing && !existing.disposed) {
          client.subs.add(slot);
          this.send(client, this.stateEvent(slot));
          return;
        }
        const c = HostController.create({
          kind: slot,
          hostName: str(d.hostName, slot === 'caller' ? 'Caller' : 'Host'),
          lobbyName: str(d.lobbyName),
          autoCallSeconds: num(d.autoCallSeconds, 5),
        });
        await this.openController(client, slot, c);
        return;
      }
      case 'host_resume': {
        const s = store.session(str(d.sessionId));
        if (!s || (s.role !== 'host' && s.role !== 'caller')) throw new Error('That session is not here any more.');
        const target: Slot = s.role;
        const existing = this.controller(target);
        if (existing && !existing.disposed) {
          if (existing.session.id === s.id) {
            client.subs.add(target);
            this.send(client, this.stateEvent(target));
            return;
          }
          throw new Error(
            target === 'caller'
              ? 'The Ball Caller desk is already open with another session. Close it first.'
              : 'Another lobby is already open on this server. Close it first.',
          );
        }
        const c = HostController.resume(s, store.latestRound(s.id), num(d.autoCallSeconds, 5));
        await this.openController(client, target, c);
        return;
      }
      case 'host_start_round':
        this.controller(slot)?.startRound(pattern());
        return;
      case 'host_continue':
        this.controller(slot)?.continueRound();
        return;
      case 'host_call_next':
        void this.controller(slot)?.callNext();
        return;
      case 'host_undo':
        this.controller(slot)?.undoLast();
        return;
      case 'host_auto':
        this.controller(slot)?.setAutoCall(d.on === true);
        return;
      case 'host_interval':
        this.controller(slot)?.setAutoCallSeconds(num(d.seconds, 5));
        return;
      case 'host_paper_winner':
        this.controller(slot)?.declarePaperWinner(str(d.name));
        return;
      case 'host_close_round':
        this.controller(slot)?.closeRound();
        return;
      case 'host_stop_save':
        await this.closeController(slot, 'saved');
        return;
      case 'host_end_session':
        await this.closeController(slot, 'ended');
        return;

      // ------------------------------------------------------------ player
      case 'player_join': {
        this.joinAs(client, {
          host: str(d.host),
          port: num(d.port, 7575),
          name: str(d.name),
          autoDaub: d.autoDaub !== false,
        });
        return;
      }
      case 'player_rejoin': {
        const s = store.session(str(d.sessionId));
        if (!s || s.role !== 'player') throw new Error('That session is not here any more.');
        const [host, portText] = (s.hostAddress ?? '').split(':');
        const port = Number.parseInt(portText ?? '', 10);
        if (!host || !Number.isInteger(port)) throw new Error('No host address stored for this session.');
        this.joinAs(client, { host, port, name: s.ownerName ?? str(d.name), autoDaub: d.autoDaub !== false });
        return;
      }
      case 'player_add_card':
        await this.players.get(client.clientId)?.addRandomCard();
        return;
      case 'player_remove_card':
        this.players.get(client.clientId)?.removeCard(str(d.cardId));
        return;
      case 'player_rename_card':
        this.players.get(client.clientId)?.renameCard(str(d.cardId), str(d.name));
        return;
      case 'player_toggle_mark':
        this.players.get(client.clientId)?.toggleMark(str(d.cardId), num(d.number));
        return;
      case 'player_auto_daub':
        this.players.get(client.clientId)?.setAutoDaub(d.on === true);
        return;
      case 'player_claim':
        this.players.get(client.clientId)?.claimBingo(str(d.cardId));
        return;
      case 'player_back_to_lobby':
        this.players.get(client.clientId)?.backToLobby();
        return;
      case 'player_retry':
        void this.players.get(client.clientId)?.connect();
        return;
      case 'player_cancel_reconnect':
        this.players.get(client.clientId)?.cancelReconnect();
        return;
      case 'player_leave': {
        const p = this.players.get(client.clientId);
        if (p) {
          p.leave();
          p.dispose();
          this.players.delete(client.clientId);
        }
        this.sendToClientId(client.clientId, { t: 'closed', d: { slot: 'player', result: 'left' } });
        this.sendToClientId(client.clientId, { t: 'player_state', d: null });
        return;
      }
      default:
        throw new Error(`Unknown command "${t}".`);
    }
  }

  /** Whether a stored session is currently open on this server (so History must not delete it). */
  isSessionActive(sessionId: string): boolean {
    if (this.host && !this.host.disposed && this.host.session.id === sessionId) return true;
    if (this.caller && !this.caller.disposed && this.caller.session.id === sessionId) return true;
    for (const p of this.players.values()) if (!p.disposed && p.localSessionId === sessionId) return true;
    return false;
  }
}

declare global {
  var __bingoHub: Hub | undefined;
}

export const hub: Hub = (globalThis.__bingoHub ??= new Hub());
