import { decodeGrid, fingerprintOf, letterFor, sharesAColumn, type Grid } from '../lib/game/card';
import { CardDealer } from '../lib/game/dealer';
import { GameEngine } from '../lib/game/engine';
import { newCode, newId } from '../lib/game/ids';
import type { WinPattern } from '../lib/game/pattern';
import { GAME_PORT, Msg, encodeJoinLink, type JsonMap, type NetMessage } from '../lib/game/protocol';
import {
  roundHasWinner,
  roundIsOpen,
  roundIsParticipant,
  winnerNames,
  type ClaimEvent,
  type GameRound,
  type GameSession,
  type HostSnapshot,
  type LanAddress,
  type LobbyPlayer,
  type WinnerInfo,
} from '../lib/game/types';
import { HostServer, type ClientConn } from './hostServer';
import { bestAddress, lanAddresses } from './lan';
import { store } from './store';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * When the server runs on the internet (Fly.io, Railway, a VPS) the address
 * players must dial is not a network interface of the container but the
 * public one: PUBLIC_HOST (an IPv4 or a DNS name) and, if the platform maps
 * the TCP port, PUBLIC_GAME_PORT. PUBLIC_URL is where browsers open the app.
 */
export const PUBLIC_HOST = process.env.PUBLIC_HOST?.trim() || null;
export const PUBLIC_GAME_PORT = Number.parseInt(process.env.PUBLIC_GAME_PORT ?? '', 10) || null;
export const PUBLIC_URL = process.env.PUBLIC_URL?.trim().replace(/\/$/, '') || null;
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export interface HostEvents {
  onChange?: () => void;
  onToast?: (message: string) => void;
  onWin?: (winner: WinnerInfo) => void;
  onNumber?: (n: number) => void;
}

/**
 * Runs the lobby server and the caller's side of a game, or, as the Ball
 * Caller (`kind: 'caller'`), just the caller's desk for paper cards with no
 * network at all. A direct port of the mobile app's HostController, so phones
 * and browsers see exactly the same rules.
 */
export class HostController {
  readonly kind: 'host' | 'caller';
  session: GameSession;
  round: GameRound | null;
  private engine: GameEngine | null = null;
  private readonly server: HostServer | null;
  private readonly dealer = new CardDealer();

  hostIp: string | null = null;
  addresses: LanAddress[] = [];
  port = GAME_PORT;
  currentNumber: number | null = null;
  autoCall = false;
  autoCallSeconds: number;
  private autoTimer: NodeJS.Timeout | null = null;
  private ipTimer: NodeJS.Timeout | null = null;
  private staleTimer: NodeJS.Timeout | null = null;

  /** Players ping every few seconds; one silent this long has a dead socket. */
  static readonly STALE_MS = 30_000;
  /** How long the ball tumbles in the cage before the number is shown. */
  static readonly DRAW_MS = 1100;

  claims: ClaimEvent[] = [];
  winners: WinnerInfo[] = [];
  /** Card layouts each player held when the round started (by lower-case name). */
  private roundCards = new Map<string, Set<string>>();
  drawing = false;
  error: string | null = null;
  roundsPlayed = 0;
  disposed = false;
  events: HostEvents = {};

  private constructor(kind: 'host' | 'caller', session: GameSession, round: GameRound | null, autoCallSeconds: number) {
    this.kind = kind;
    this.session = session;
    this.round = round;
    this.autoCallSeconds = autoCallSeconds;
    this.server = kind === 'host' ? new HostServer() : null;
  }

  static create(args: { kind: 'host' | 'caller'; hostName: string; lobbyName: string; autoCallSeconds?: number }) {
    const now = new Date().toISOString();
    const fallback = args.kind === 'caller' ? 'Ball Caller' : `${args.hostName}'s Bingo`;
    const session: GameSession = {
      id: newId('s'),
      name: args.lobbyName.trim() || fallback,
      hostName: args.hostName,
      role: args.kind,
      status: 'lobby',
      code: newCode(),
      hostAddress: null,
      players: [],
      ownerClientId: null,
      ownerName: null,
      createdAt: now,
      updatedAt: now,
      endedAt: null,
    };
    return new HostController(args.kind, session, null, args.autoCallSeconds ?? 5);
  }

  static resume(session: GameSession, round: GameRound | null, autoCallSeconds = 5) {
    return new HostController(session.role === 'caller' ? 'caller' : 'host', session, round, autoCallSeconds);
  }

  // ------------------------------------------------------------------ getters

  get isRunning(): boolean {
    return this.kind === 'caller' ? !this.disposed : (this.server?.isRunning ?? false);
  }

  get roundActive(): boolean {
    return this.round?.status === 'playing';
  }

  get roundPaused(): boolean {
    return this.round?.status === 'paused';
  }

  get roundOpen(): boolean {
    return roundIsOpen(this.round);
  }

  get roundWon(): boolean {
    return this.round?.status === 'won';
  }

  /** Called numbers as the desk shows them: the tumbling ball stays hidden. */
  get called(): number[] {
    const list = this.round?.called ?? [];
    return this.drawing && list.length ? list.slice(0, -1) : list;
  }

  get remaining(): number {
    return 75 - this.called.length;
  }

  get canUndo(): boolean {
    return this.kind === 'caller' && this.roundActive && !this.drawing && (this.round?.called.length ?? 0) > 0;
  }

  /** The port players dial: the platform's public mapping when there is one. */
  get publicPort(): number {
    return PUBLIC_HOST && PUBLIC_GAME_PORT ? PUBLIC_GAME_PORT : this.port;
  }

  get joinLink(): string | null {
    if (!this.hostIp || this.kind !== 'host') return null;
    return encodeJoinLink({ host: this.hostIp, port: this.publicPort, code: this.session.code, name: this.session.name });
  }

  get players(): LobbyPlayer[] {
    if (!this.server) return [];
    return [...this.server.clients.values()]
      .filter((c) => c.joined)
      .map((c) => ({ name: c.name, cardCount: c.cardCount, address: c.address, waiting: c.waiting }));
  }

  get activePlayerCount(): number {
    return this.players.filter((p) => !p.waiting).length;
  }

  get playersWithoutCards(): LobbyPlayer[] {
    return this.players.filter((p) => p.cardCount === 0);
  }

  get playersReady(): LobbyPlayer[] {
    return this.players.filter((p) => p.cardCount > 0);
  }

  private notify() {
    if (!this.disposed) this.events.onChange?.();
  }

  private toast(message: string) {
    if (!this.disposed) this.events.onToast?.(message);
  }

  snapshot(): HostSnapshot {
    return {
      kind: this.kind,
      session: this.session,
      round: this.round,
      called: this.called,
      currentNumber: this.currentNumber,
      drawing: this.drawing,
      autoCall: this.autoCall,
      autoCallSeconds: this.autoCallSeconds,
      players: this.players,
      claims: this.claims.slice(0, 8),
      winners: this.winners,
      hostIp: this.hostIp,
      addresses: this.addresses,
      port: this.publicPort,
      joinLink: this.joinLink,
      publicUrl: PUBLIC_URL,
      roundsPlayed: this.roundsPlayed,
      running: this.isRunning,
      error: this.error,
    };
  }

  // -------------------------------------------------------------------- start

  async start() {
    this.roundsPlayed = store.roundCount(this.session.id);
    if (this.server) {
      this.server.onMessage = (c, m) => this.onMessage(c, m);
      this.server.onDisconnect = (c) => this.onDisconnect(c);
      this.server.discoveryInfo = () => ({
        name: this.session.name,
        hostName: this.session.hostName,
        code: this.session.code,
        status: this.session.status,
        players: this.players.length,
      });
      try {
        this.port = await this.server.start();
      } catch (e) {
        const code = (e as NodeJS.ErrnoException)?.code;
        this.error =
          code === 'EADDRINUSE'
            ? `Port ${GAME_PORT} is already in use on this computer. Is another Classic Bingo lobby (or server) running?`
            : `Could not open port ${GAME_PORT} on this computer (${(e as Error)?.message ?? e}).`;
        this.notify();
        throw e;
      }
      this.loadAddresses();
      this.session.hostAddress = this.hostIp;
      if (!PUBLIC_HOST) this.ipTimer = setInterval(() => this.refreshIp(), 5000);
      this.staleTimer = setInterval(() => this.dropStale(), 10_000);
    }
    const r = this.round;
    if (r && roundIsOpen(r)) {
      if (this.kind === 'host') {
        // Resumes as paused so the host can wait for players to reconnect.
        r.status = 'paused';
        this.session.status = 'paused';
      } else {
        // Nobody has to reconnect to a paper-card game: just continue calling.
        r.status = 'playing';
        this.session.status = 'playing';
        this.roundsPlayed = Math.max(0, this.roundsPlayed - 1);
      }
      store.upsertRound(r);
      this.engine = new GameEngine(r.pattern, r.called);
      this.currentNumber = r.called.length ? r.called[r.called.length - 1] : null;
      this.winners = [...r.winners];
    } else {
      if (r && !roundIsOpen(r)) this.round = null;
      this.session.status = 'lobby';
    }
    store.upsertSession(this.session);
    this.notify();
  }

  private dropStale() {
    if (!this.server) return;
    const cutoff = Date.now() - HostController.STALE_MS;
    for (const c of [...this.server.clients.values()]) {
      if (c.joined && c.lastSeen < cutoff) {
        this.server.kick(c);
        this.toast(`${c.name} lost connection`);
      }
    }
  }

  private loadAddresses() {
    if (PUBLIC_HOST) {
      this.hostIp = PUBLIC_HOST;
      this.addresses = [];
      return;
    }
    const best = bestAddress();
    this.hostIp = best?.ip ?? null;
    this.addresses = lanAddresses();
  }

  private refreshIp() {
    const best = bestAddress();
    const ip = best?.ip ?? null;
    this.addresses = lanAddresses();
    if (ip === this.hostIp) return;
    const wasLost = this.hostIp == null;
    this.hostIp = ip;
    if (ip) {
      this.session.hostAddress = ip;
      store.upsertSession(this.session);
      if (wasLost) this.toast(`Network is back: players can reconnect at ${ip}`);
    } else {
      this.toast('Network connection lost. The lobby stays open; reconnect to the WiFi.');
    }
    this.notify();
  }

  private roundJson(): JsonMap | null {
    const r = this.round;
    if (!r) return null;
    return {
      id: r.id,
      number: r.number,
      pattern: r.pattern,
      called: r.called,
      participants: r.participants,
      status: r.status,
      winner: this.winners[0] ? winnerJson(this.winners[0]) : null,
      winners: this.winners.map(winnerJson),
    };
  }

  // --------------------------------------------------------------- networking

  private onMessage(conn: ClientConn, msg: NetMessage) {
    switch (msg.t) {
      case Msg.join:
        this.handleJoin(conn, msg.d);
        break;
      case Msg.cards:
        conn.cardCount = num(msg.d.count);
        this.registerCards(conn, msg.d.cards);
        this.broadcastPlayers();
        this.notify();
        break;
      case Msg.claim:
        this.handleClaim(conn, msg.d);
        break;
      case Msg.dealRequest:
        this.handleDeal(conn, msg.d);
        break;
      case Msg.leave:
        this.server?.kick(conn);
        break;
      case Msg.ping:
        this.server?.send(conn, Msg.pong);
        break;
    }
  }

  private handleJoin(conn: ClientConn, d: JsonMap) {
    const server = this.server!;
    const name = str(d.name).trim();
    const clientId = str(d.clientId).trim();
    if (!name) {
      server.kick(conn, { t: Msg.rejected, d: { reason: 'A name is required.' } });
      return;
    }
    if (this.session.status === 'finished') {
      server.kick(conn, { t: Msg.rejected, d: { reason: 'This session has ended.' } });
      return;
    }
    // The same device coming back (after a dropped connection) replaces its old socket.
    for (const c of [...server.clients.values()]) {
      if (c.id === conn.id || !c.joined) continue;
      if (clientId && c.clientId === clientId) server.kick(c, undefined, true);
    }
    const duplicate = [...server.clients.values()].some(
      (c) => c.joined && c.id !== conn.id && c.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      server.kick(conn, { t: Msg.rejected, d: { reason: 'Someone in the lobby already uses that name.' } });
      return;
    }
    const r = this.round;
    conn.name = name;
    conn.clientId = clientId;
    conn.joined = true;
    conn.cardCount = num(d.cards);
    conn.waiting = !!r && roundIsOpen(r) && r.participants.length > 0 && !roundIsParticipant(r, name);
    if (!this.session.players.includes(name)) this.session.players.push(name);
    server.send(conn, Msg.welcome, {
      sessionId: this.session.id,
      sessionName: this.session.name,
      hostName: this.session.hostName,
      code: this.session.code,
      status: this.session.status,
      round: this.roundJson(),
      waiting: conn.waiting,
      players: this.players.map(playerJson),
    });
    this.broadcastPlayers();
    store.upsertSession(this.session);
    this.toast(conn.waiting ? `${name} joined and waits for the next round` : `${name} joined the lobby`);
    this.notify();
  }

  /** Every card in the lobby must be different; copies are sent back for reshuffling. */
  private registerCards(conn: ClientConn, raw: unknown) {
    if (!Array.isArray(raw) || !this.server) return;
    const others: Grid[] = [];
    const taken = new Set<string>();
    for (const c of this.server.clients.values()) {
      if (c.id === conn.id || !c.joined) continue;
      others.push(...c.grids);
      for (const f of c.fingerprints) taken.add(f);
    }
    const mine = new Set<string>();
    const grids: Grid[] = [];
    const duplicates: string[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const id = str((item as JsonMap).id);
      let grid: Grid;
      try {
        grid = decodeGrid((item as JsonMap).grid);
      } catch {
        continue;
      }
      const fp = fingerprintOf(grid);
      const lookalike = others.some((g) => sharesAColumn(g, grid)) || grids.some((g) => sharesAColumn(g, grid));
      if (taken.has(fp) || mine.has(fp) || lookalike) duplicates.push(id);
      else {
        mine.add(fp);
        grids.push(grid);
      }
    }
    conn.fingerprints = mine;
    conn.grids = grids;
    for (const id of duplicates) this.server.send(conn, Msg.duplicateCard, { cardId: id });
  }

  /**
   * The host is the dealer. Cards are dealt in the lobby and as soon as a
   * round is won (the new card plays from the next round); only a round that
   * is still being called, or paused mid-way, refuses new cards.
   */
  private handleDeal(conn: ClientConn, d: JsonMap) {
    const server = this.server!;
    const r = this.round;
    const midRound = !!r && (r.status === 'playing' || r.status === 'paused');
    if (midRound && !conn.waiting && conn.cardCount > 0) {
      server.send(conn, Msg.dealt, {
        reqId: d.reqId,
        grids: [],
        refused: true,
        reason: 'Cards can only be added between rounds.',
      });
      return;
    }
    const count = Math.min(6, Math.max(1, num(d.count, 1)));
    const inPlay: Grid[] = [];
    for (const c of server.clients.values()) if (c.joined) inPlay.push(...c.grids);
    const dealt = this.dealer.dealMany(inPlay, count);
    conn.grids = [...conn.grids, ...dealt];
    for (const g of dealt) conn.fingerprints.add(fingerprintOf(g));
    server.send(conn, Msg.dealt, { reqId: d.reqId, grids: dealt });
  }

  private heldByAnotherPlayer(conn: ClientConn, grid: Grid): boolean {
    const fp = fingerprintOf(grid);
    return [...this.server!.clients.values()].some(
      (c) => c.id !== conn.id && c.joined && (c.fingerprints.has(fp) || c.grids.some((g) => sharesAColumn(g, grid))),
    );
  }

  private onDisconnect(conn: ClientConn) {
    if (!conn.joined) return;
    this.broadcastPlayers();
    this.toast(`${conn.name} left`);
    this.notify();
  }

  private broadcastPlayers() {
    this.server?.broadcast(Msg.players, { players: this.players.map(playerJson) });
  }

  private handleClaim(conn: ClientConn, d: JsonMap) {
    const server = this.server!;
    const cardRaw = d.card as JsonMap | undefined;
    let grid: Grid;
    const cardId = str(cardRaw?.id);
    const cardName = str(cardRaw?.name) || 'Card';
    try {
      grid = decodeGrid(cardRaw?.grid);
    } catch {
      server.send(conn, Msg.claimResult, { valid: false, reason: 'Unreadable card.' });
      return;
    }
    const r = this.round;
    const e = this.engine;
    const reply = (valid: boolean, reason: string, cells: number[] = []) =>
      server.send(conn, Msg.claimResult, { valid, reason, cardId, cells });
    if (!r || !e || !(r.status === 'playing' || r.status === 'won')) {
      reply(false, 'No round is running right now.');
      return;
    }
    const roundSet = this.roundCards.get(conn.name.toLowerCase());
    if (roundSet && !roundSet.has(fingerprintOf(grid))) {
      reply(false, 'That card was added after the round started, so it plays from the next round.');
      return;
    }
    if (this.heldByAnotherPlayer(conn, grid)) {
      reply(false, "That card copies another player's card, so it does not count.");
      server.send(conn, Msg.duplicateCard, { cardId });
      return;
    }
    if (roundHasWinner(r, conn.name)) {
      reply(true, 'You are already a winner of this round.');
      return;
    }
    if (conn.waiting) {
      reply(false, 'You joined during this round. You can play from the next round.');
      return;
    }
    const verdict = e.verify({ grid });
    this.claims.unshift({
      playerName: conn.name,
      cardName,
      valid: verdict.valid,
      reason: verdict.reason,
      at: new Date().toISOString(),
    });
    reply(verdict.valid, verdict.reason, verdict.cells);
    if (!verdict.valid) {
      this.toast(`${conn.name} called BINGO, but: ${verdict.reason}`);
      this.notify();
      return;
    }
    this.addWinner({
      playerName: conn.name,
      cardName,
      grid,
      cells: verdict.cells,
      pattern: r.pattern,
      roundNumber: r.number,
      calledCount: r.called.length,
    });
  }

  /** First valid claim ends the calling; later ones join as co-winners. */
  private addWinner(w: WinnerInfo) {
    const r = this.round!;
    const first = this.winners.length === 0;
    this.setAutoCall(false);
    this.winners.push(w);
    r.status = 'won';
    r.winners = [...this.winners];
    r.winnerName = winnerNames(this.winners);
    r.endedAt = new Date().toISOString();
    this.session.status = 'lobby';
    store.upsertRound(r);
    store.upsertSession(this.session);
    this.server?.broadcast(Msg.gameWon, {
      winner: winnerJson(this.winners[0]),
      winners: this.winners.map(winnerJson),
    });
    if (first) {
      this.clearWaiting();
      this.notify();
      this.events.onWin?.(w);
    } else {
      this.toast(`${w.playerName} also has BINGO${w.grid.length ? ` on "${w.cardName}"` : ''}`);
      this.notify();
    }
  }

  /** Once a round is over, everyone in the lobby is eligible for the next one. */
  private clearWaiting() {
    if (!this.server) return;
    let changed = false;
    for (const c of this.server.clients.values()) {
      if (c.waiting) {
        c.waiting = false;
        changed = true;
      }
    }
    if (changed) this.broadcastPlayers();
  }

  /** The caller checked a paper card and records its owner as a winner. */
  declarePaperWinner(name: string) {
    const r = this.round;
    if (!r || this.drawing || !(r.status === 'playing' || r.status === 'won')) return;
    const clean = name.trim();
    if (!clean || roundHasWinner(r, clean)) return;
    this.addWinner({
      playerName: clean,
      cardName: 'Paper card',
      grid: [],
      cells: [],
      pattern: r.pattern,
      roundNumber: r.number,
      calledCount: r.called.length,
    });
  }

  // ---------------------------------------------------------------- game flow

  startRound(pattern: WinPattern) {
    if (this.roundOpen) return;
    const count = store.roundCount(this.session.id);
    this.roundsPlayed = count;
    if (this.server) {
      for (const c of this.server.clients.values()) c.waiting = c.cardCount === 0;
      this.roundCards = new Map(
        [...this.server.clients.values()]
          .filter((c) => c.joined && c.cardCount > 0)
          .map((c) => [c.name.toLowerCase(), new Set(c.fingerprints)]),
      );
    }
    const now = new Date().toISOString();
    this.round = {
      id: newId('g'),
      sessionId: this.session.id,
      number: count + 1,
      pattern,
      called: [],
      participants: this.playersReady.map((p) => p.name),
      winners: [],
      status: 'playing',
      winnerName: null,
      startedAt: now,
      updatedAt: now,
      endedAt: null,
    };
    this.engine = new GameEngine(pattern);
    this.currentNumber = null;
    this.drawing = false;
    this.winners = [];
    this.claims = [];
    this.session.status = 'playing';
    store.upsertRound(this.round);
    store.upsertSession(this.session);
    this.server?.broadcast(Msg.gameStart, { round: this.roundJson() });
    this.broadcastPlayers();
    this.notify();
  }

  continueRound() {
    const r = this.round;
    if (!r || r.status !== 'paused') return;
    r.status = 'playing';
    this.session.status = 'playing';
    this.engine ??= new GameEngine(r.pattern, r.called);
    this.currentNumber = r.called.length ? r.called[r.called.length - 1] : null;
    store.upsertRound(r);
    store.upsertSession(this.session);
    this.server?.broadcast(Msg.gameStart, { round: this.roundJson(), resumed: true });
    this.notify();
  }

  async callNext(): Promise<number | null> {
    const r = this.round;
    const e = this.engine;
    if (!r || !e || r.status !== 'playing' || this.drawing) return null;
    const n = e.callNext();
    if (n == null) {
      this.setAutoCall(false);
      this.toast('All 75 numbers have been called.');
      return null;
    }
    // The number is final and saved right away; the cage animation only
    // delays showing and announcing it.
    r.called = [...e.called];
    store.upsertRound(r);
    this.drawing = true;
    this.notify();
    await sleep(HostController.DRAW_MS);
    if (this.disposed) return n;
    this.drawing = false;
    this.currentNumber = n;
    this.server?.broadcast(Msg.number, { value: n, letter: letterFor(n), called: r.called });
    if (e.isExhausted) this.setAutoCall(false);
    this.notify();
    this.events.onNumber?.(n);
    return n;
  }

  /** Ball Caller only: take the last call back (a mis-tap) into the cage. */
  undoLast(): number | null {
    const r = this.round;
    const e = this.engine;
    if (!this.canUndo || !r || !e) return null;
    const n = e.undoLast();
    if (n == null) return null;
    r.called = [...e.called];
    this.currentNumber = r.called.length ? r.called[r.called.length - 1] : null;
    store.upsertRound(r);
    this.notify();
    return n;
  }

  setAutoCall(on: boolean) {
    this.autoCall = on;
    if (this.autoTimer) clearInterval(this.autoTimer);
    this.autoTimer = null;
    if (on) {
      this.autoTimer = setInterval(() => {
        if (this.roundActive) {
          if (!this.drawing) void this.callNext();
        } else {
          this.setAutoCall(false);
        }
      }, this.autoCallSeconds * 1000);
    }
    this.notify();
  }

  setAutoCallSeconds(seconds: number) {
    this.autoCallSeconds = Math.min(30, Math.max(2, Math.trunc(seconds) || 5));
    if (this.autoCall) this.setAutoCall(true);
    this.notify();
  }

  /** Stop & Save: pause the round, keep everything, tell players, close the lobby. */
  async stopAndSave() {
    this.setAutoCall(false);
    const r = this.round;
    if (r && r.status === 'playing') {
      r.status = 'paused';
      store.upsertRound(r);
    }
    this.session.status = 'paused';
    store.upsertSession(this.session);
    this.server?.broadcast(Msg.gamePaused, { reason: 'The host saved the game. Rejoin when it resumes.' });
    await sleep(300);
    await this.server?.stop();
    this.notify();
  }

  /** Close the current round (after a win, or abandon it) so a new one can start. */
  closeRound() {
    const r = this.round;
    if (!r) return;
    this.setAutoCall(false);
    if (r.status !== 'won') {
      r.status = 'stopped';
      r.endedAt = new Date().toISOString();
      store.upsertRound(r);
      this.server?.broadcast(Msg.gameStopped, { reason: 'The host ended the round.' });
    }
    this.roundsPlayed = store.roundCount(this.session.id);
    this.round = null;
    this.engine = null;
    this.currentNumber = null;
    this.drawing = false;
    this.winners = [];
    this.session.status = 'lobby';
    store.upsertSession(this.session);
    this.clearWaiting();
    this.notify();
  }

  async endSession() {
    this.setAutoCall(false);
    const r = this.round;
    if (r && roundIsOpen(r)) {
      r.status = 'stopped';
      r.endedAt = new Date().toISOString();
      store.upsertRound(r);
    }
    this.session.status = 'finished';
    this.session.endedAt = new Date().toISOString();
    store.upsertSession(this.session);
    this.server?.broadcast(Msg.sessionEnd, { reason: 'The host closed the lobby.' });
    await sleep(300);
    await this.server?.stop();
    this.notify();
  }

  dispose() {
    this.disposed = true;
    if (this.autoTimer) clearInterval(this.autoTimer);
    if (this.ipTimer) clearInterval(this.ipTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    void this.server?.stop();
  }
}

function playerJson(p: LobbyPlayer): JsonMap {
  return { name: p.name, cards: p.cardCount, waiting: p.waiting };
}

function winnerJson(w: WinnerInfo): JsonMap {
  return {
    playerName: w.playerName,
    cardName: w.cardName,
    grid: w.grid,
    cells: w.cells,
    pattern: w.pattern,
    roundNumber: w.roundNumber,
    calledCount: w.calledCount,
  };
}
