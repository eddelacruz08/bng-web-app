import {
  cardNumbers,
  copyCard,
  decodeGrid,
  fingerprintOf,
  letterFor,
  newCard,
  uniqueRandomGrid,
  type BingoCard,
  type Grid,
} from '../lib/game/card';
import { isSatisfied, patternFromKey } from '../lib/game/pattern';
import { Msg, PROTOCOL_VERSION, type JsonMap, type NetMessage } from '../lib/game/protocol';
import {
  winnerNames,
  type GameRound,
  type GameSession,
  type GameStatus,
  type LobbyPlayer,
  type PlayerPhase,
  type PlayerSnapshot,
  type SessionStatus,
  type WinnerInfo,
} from '../lib/game/types';
import { isValidIpv4 } from '../lib/game/protocol';
import { bestAddress, sameSubnet } from './lan';
import { DISCONNECTED, LobbyClient } from './lobbyClient';
import { store } from './store';

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback);

export interface PlayerEvents {
  onChange?: () => void;
  onToast?: (message: string) => void;
  onWin?: (winner: WinnerInfo) => void;
  onAutoBingo?: (card: BingoCard) => void;
  onClaimRejected?: (reason: string) => void;
  onNumber?: (n: number) => void;
}

/** Turns a failed connection into a plain explanation and fix. */
export function explainConnectionError(host: string, port: number, e: unknown): string {
  const code = (e as NodeJS.ErrnoException)?.code ?? '';
  if (code === 'ECONNREFUSED') {
    return `Reached ${host}, but no lobby is open on port ${port}. On the host, open "Host a Game" and keep it on screen, then try again.`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `The address ${host} could not be found. Check the spelling of the host name.`;
  }
  if (!isValidIpv4(host) && host !== 'localhost') {
    return `Could not reach ${host} on port ${port} over the internet. Check that the server is running and that port ${port} is open there.`;
  }
  const mine = bestAddress();
  if (!mine) {
    return 'This computer has no local network address. Connect it to the same WiFi (or hotspot) as the host and try again.';
  }
  if (!sameSubnet(mine.ip, host, mine.prefix) && !host.startsWith('127.')) {
    return `This computer is ${mine.ip}, but the host address ${host} is on a different network. Check both are on the same WiFi, and use the address shown on the host's lobby screen.`;
  }
  return (
    `Could not reach the host at ${host}. Both are on the same network, so this WiFi is probably blocking devices ` +
    'from talking to each other (common on office, school, hotel and guest WiFi). ' +
    "Fix: turn on the host phone's hotspot, connect this computer to it, then join again."
  );
}

/**
 * A web player's connection to a host (a phone or a browser-hosted lobby)
 * plus their cards for that session. Runs on the server so a page refresh
 * never loses the game; reconnects by itself when the connection drops.
 */
export class PlayerController {
  readonly clientId: string;
  readonly playerName: string;
  readonly host: string;
  readonly port: number;
  autoDaub: boolean;

  private client = new LobbyClient();
  private welcomeTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private lastSeen = Date.now();
  private deals = new Map<string, { resolve: (g: Grid[]) => void; reject: (e: Error) => void }>();
  private dealSeq = 0;
  disposed = false;

  static readonly HEARTBEAT_MS = 4000;
  static readonly SILENT_MS = 14_000;
  static readonly MAX_RECONNECT = 60;

  phase: PlayerPhase = 'connecting';
  error: string | null = null;
  reconnectAttempts = 0;
  sessionId = '';
  sessionName = '';
  hostName = '';
  code = '';
  players: LobbyPlayer[] = [];
  round: GameRound | null = null;
  currentNumber: number | null = null;
  cards: BingoCard[] = [];
  winners: WinnerInfo[] = [];
  claimPending = false;
  lastClaimReason: string | null = null;
  lastClaimValid = false;
  highlightCells: number[] = [];
  highlightCardId: string | null = null;
  waitingForNextRound = false;
  private localSession: GameSession | null = null;
  /** Cards already called automatically this round (each card is called once). */
  private autoCalled = new Set<string>();
  events: PlayerEvents = {};

  constructor(args: { clientId: string; playerName: string; host: string; port: number; autoDaub: boolean }) {
    this.clientId = args.clientId;
    this.playerName = args.playerName;
    this.host = args.host;
    this.port = args.port;
    this.autoDaub = args.autoDaub;
  }

  /** Sessions are stored under a player-side id so a host and a player on the same server never collide. */
  get localSessionId(): string {
    return `p_${this.sessionId}`;
  }

  get called(): number[] {
    return this.round?.called ?? [];
  }

  get inRound(): boolean {
    return !!this.round && this.round.status === 'playing' && !this.waitingForNextRound;
  }

  get iAmWinner(): boolean {
    return this.winners.some((w) => w.isMe);
  }

  /** Claims are also accepted right after someone else won on the same ball. */
  get canStillClaim(): boolean {
    const r = this.round;
    return !!r && (r.status === 'playing' || r.status === 'won') && !this.waitingForNextRound && !this.iAmWinner;
  }

  /** Cards can be added in the lobby and once a round is over, never mid-round. */
  get canAddCards(): boolean {
    return this.phase === 'lobby' || this.phase === 'won';
  }

  private notify() {
    if (!this.disposed) this.events.onChange?.();
  }

  private toast(m: string) {
    if (!this.disposed) this.events.onToast?.(m);
  }

  snapshot(): PlayerSnapshot {
    return {
      clientId: this.clientId,
      playerName: this.playerName,
      host: this.host,
      port: this.port,
      phase: this.phase,
      error: this.error,
      reconnectAttempts: this.reconnectAttempts,
      sessionId: this.sessionId,
      sessionName: this.sessionName,
      hostName: this.hostName,
      code: this.code,
      players: this.players,
      round: this.round,
      currentNumber: this.currentNumber,
      called: this.called,
      cards: this.cards,
      winners: this.winners,
      claimPending: this.claimPending,
      lastClaimReason: this.lastClaimReason,
      highlightCardId: this.highlightCardId,
      highlightCells: this.highlightCells,
      waitingForNextRound: this.waitingForNextRound,
      autoDaub: this.autoDaub,
      canAddCards: this.canAddCards,
      canStillClaim: this.canStillClaim,
    };
  }

  // --------------------------------------------------------------- connection

  async connect(reconnect = false) {
    if (this.disposed) return;
    this.clearTimer('welcome');
    this.client.close();
    this.client = new LobbyClient();
    if (!reconnect) {
      this.phase = 'connecting';
      this.error = null;
      this.reconnectAttempts = 0;
    }
    this.notify();
    try {
      await this.client.connect(this.host, this.port);
    } catch (e) {
      if (this.disposed) return;
      if (reconnect) {
        this.retryLater();
      } else {
        this.error = explainConnectionError(this.host, this.port, e);
        this.phase = 'disconnected';
      }
      this.notify();
      return;
    }
    this.client.onMessage = (m) => this.handle(m);
    this.lastSeen = Date.now();
    this.startHeartbeat();
    this.client.send(Msg.join, {
      name: this.playerName,
      v: PROTOCOL_VERSION,
      clientId: this.clientId,
      cards: this.cards.length,
    });
    this.welcomeTimer = setTimeout(() => {
      if (this.phase === 'connecting') {
        this.error = 'The host did not answer. Is the lobby still open?';
        this.phase = 'disconnected';
        this.client.close();
        this.notify();
      } else if (this.phase === 'reconnecting' || this.phase === 'paused') {
        this.client.close();
        this.retryLater();
      }
    }, 6000);
  }

  private clearTimer(which: 'welcome' | 'reconnect' | 'heartbeat') {
    const t = which === 'welcome' ? this.welcomeTimer : which === 'reconnect' ? this.reconnectTimer : this.heartbeat;
    if (t) {
      clearTimeout(t);
      clearInterval(t);
    }
    if (which === 'welcome') this.welcomeTimer = null;
    else if (which === 'reconnect') this.reconnectTimer = null;
    else this.heartbeat = null;
  }

  private startHeartbeat() {
    this.clearTimer('heartbeat');
    this.heartbeat = setInterval(() => {
      if (this.disposed || !this.client.isConnected) return;
      const live = ['lobby', 'playing', 'waitingRound', 'won', 'connecting'].includes(this.phase);
      if (!live) return;
      if (Date.now() - this.lastSeen > PlayerController.SILENT_MS) {
        this.clearTimer('heartbeat');
        this.client.close();
        this.startReconnect();
        this.notify();
        return;
      }
      this.client.send(Msg.ping);
    }, PlayerController.HEARTBEAT_MS);
  }

  /** Schedules the next reconnect attempt (quietly for as long as the host has paused). */
  private retryLater() {
    if (this.disposed) return;
    const unlimited = this.phase === 'paused';
    if (!unlimited && this.reconnectAttempts >= PlayerController.MAX_RECONNECT) {
      this.phase = 'disconnected';
      this.error = 'Could not reconnect to the host. Rejoin from History once the lobby is back.';
      this.notify();
      return;
    }
    this.clearTimer('reconnect');
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectAttempts++;
        this.notify();
        void this.connect(true);
      },
      unlimited ? 5000 : 3000,
    );
  }

  private startReconnect() {
    if (this.phase !== 'reconnecting') this.reconnectAttempts = 0;
    this.phase = 'reconnecting';
    this.error = 'Connection to the host was lost.';
    this.retryLater();
  }

  cancelReconnect() {
    this.clearTimer('reconnect');
    this.clearTimer('welcome');
    this.phase = 'disconnected';
    this.error ??= 'Reconnect cancelled.';
    this.notify();
  }

  private handle(m: NetMessage) {
    this.lastSeen = Date.now();
    switch (m.t) {
      case Msg.welcome:
        void this.onWelcome(m.d);
        return; // onWelcome notifies when done
      case Msg.rejected:
        this.clearTimer('welcome');
        this.clearTimer('reconnect');
        this.error = str(m.d.reason, 'The host rejected the connection.');
        this.phase = 'disconnected';
        break;
      case Msg.players:
        this.players = parsePlayers(m.d.players);
        break;
      case Msg.gameStart:
        this.onGameStart(m.d);
        break;
      case Msg.number:
        this.onNumber(m.d);
        break;
      case Msg.claimResult:
        this.onClaimResult(m.d);
        break;
      case Msg.duplicateCard:
        void this.onDuplicateCard(m.d);
        break;
      case Msg.dealt: {
        const id = str(m.d.reqId);
        const raw = m.d.grids;
        const grids = Array.isArray(raw) ? raw.map((g) => decodeGrid(g)) : [];
        const pending = this.deals.get(id);
        this.deals.delete(id);
        if (m.d.refused === true) {
          this.toast(str(m.d.reason, 'The host is not dealing cards right now.'));
          pending?.reject(new Error('refused'));
        } else {
          pending?.resolve(grids);
        }
        break;
      }
      case Msg.gameWon:
        this.onGameWon(m.d);
        break;
      case Msg.gamePaused:
        this.onPaused(m.d);
        break;
      case Msg.gameStopped:
        this.onStopped(m.d);
        break;
      case Msg.sessionEnd:
        this.clearTimer('reconnect');
        this.phase = 'ended';
        this.error = str(m.d.reason, null as unknown as string) || null;
        this.persistSession('finished');
        this.client.close();
        break;
      case DISCONNECTED:
        switch (this.phase) {
          case 'lobby':
          case 'playing':
          case 'waitingRound':
          case 'reconnecting':
            this.startReconnect();
            break;
          case 'paused':
            this.retryLater();
            break;
          case 'connecting':
            this.error ??= 'Connection to the host was lost.';
            this.phase = 'disconnected';
            break;
        }
        break;
    }
    this.notify();
  }

  private roundFromJson(j: JsonMap): GameRound {
    const now = new Date().toISOString();
    // A browser-hosted lobby and its web players share this server's store,
    // so the player's copy of a round gets its own id (like its session does).
    return {
      id: `p_${str(j.id) || `g${Date.now().toString(36)}`}`,
      sessionId: this.localSessionId,
      number: num(j.number, 1),
      pattern: patternFromKey(str(j.pattern)),
      called: Array.isArray(j.called) ? j.called.map((n) => num(n)) : [],
      participants: Array.isArray(j.participants) ? j.participants.map((p) => str(p)) : [],
      winners: [],
      status: (['playing', 'paused', 'won', 'stopped'].includes(str(j.status)) ? str(j.status) : 'playing') as GameStatus,
      winnerName: null,
      startedAt: now,
      updatedAt: now,
      endedAt: null,
    };
  }

  private async onWelcome(d: JsonMap) {
    this.clearTimer('welcome');
    this.clearTimer('reconnect');
    const wasReconnecting = this.phase === 'reconnecting' || this.reconnectAttempts > 0;
    this.claimPending = false;
    this.autoCalled.clear();
    this.reconnectAttempts = 0;
    this.error = null;
    this.sessionId = str(d.sessionId);
    this.sessionName = str(d.sessionName, 'Bingo Lobby');
    this.hostName = str(d.hostName, 'Host');
    this.code = str(d.code);
    this.players = parsePlayers(d.players);
    this.waitingForNextRound = d.waiting === true;
    const status = (['lobby', 'playing', 'paused', 'finished'].includes(str(d.status)) ? str(d.status) : 'lobby') as SessionStatus;

    // Restore the cards (with marks) this browser used in this session before.
    this.cards = store.sessionCards(this.localSessionId, this.playerName);
    if (this.cards.length === 0) {
      // First time in this session: the host deals one card per saved card (at least one).
      const saved = store.templateCards(this.playerName);
      const want = saved.length === 0 ? 1 : Math.min(saved.length, 6);
      let dealt: Grid[] = [];
      try {
        dealt = await this.requestDeal(want);
      } catch {
        dealt = [];
      }
      if (this.disposed) return;
      for (let i = 0; i < want; i++) {
        this.cards.push(
          newCard({
            owner: this.playerName,
            name: i < saved.length ? saved[i].name : `Card ${i + 1}`,
            grid: i < dealt.length ? dealt[i] : uniqueRandomGrid(new Set(this.cards.map((c) => fingerprintOf(c.grid)))),
            sessionId: this.localSessionId,
          }),
        );
      }
      store.upsertCards(this.cards);
    }
    const previous = store.latestRound(this.localSessionId);

    const rj = d.round;
    if (rj && typeof rj === 'object') {
      const r = this.roundFromJson(rj as JsonMap);
      if (r.status === 'playing' || r.status === 'paused') {
        this.round = r;
        if (!previous || previous.id !== r.id) this.clearMarksOnly();
        this.currentNumber = r.called.length ? r.called[r.called.length - 1] : null;
        if (this.autoDaub && !this.waitingForNextRound) this.applyAutoDaub();
        store.upsertCards(this.cards);
        this.phase = r.status === 'paused' ? 'paused' : this.waitingForNextRound ? 'waitingRound' : 'playing';
      } else if (r.status === 'won' && Array.isArray((rj as JsonMap).winners)) {
        this.round = r;
        if (!previous || previous.id !== r.id) this.clearMarksOnly();
        this.currentNumber = r.called.length ? r.called[r.called.length - 1] : null;
        const list = parseWinners((rj as JsonMap).winners, this.playerName);
        this.winners = list;
        r.winners = [...list];
        r.winnerName = winnerNames(list);
        if (this.autoDaub) this.applyAutoDaub();
        store.upsertCards(this.cards);
        this.phase = list.length === 0 ? 'lobby' : 'won';
        if (this.phase === 'won') {
          this.events.onWin?.(list[0]);
          this.checkAutoBingo();
        }
      } else {
        this.round = null;
        this.waitingForNextRound = false;
        this.phase = 'lobby';
      }
    } else {
      this.round = null;
      this.waitingForNextRound = false;
      this.phase = status === 'paused' ? 'paused' : 'lobby';
    }
    this.persistSession(status);
    this.persistRound();
    this.sendCardCount();
    if (this.phase === 'playing') this.checkAutoBingo();
    if (wasReconnecting) this.toast(`Reconnected to ${this.hostName || 'the host'}.`);
    this.notify();
  }

  private onGameStart(d: JsonMap) {
    const rj = d.round;
    if (!rj || typeof rj !== 'object') return;
    const r = this.roundFromJson(rj as JsonMap);
    r.status = 'playing';
    const resumed = d.resumed === true;
    const isNewRound = !this.round || this.round.id !== r.id;
    this.round = r;
    this.winners = [];
    this.highlightCells = [];
    this.highlightCardId = null;
    this.claimPending = false;
    this.lastClaimReason = null;
    if (!resumed) this.waitingForNextRound = false;
    if (isNewRound && !resumed) {
      this.autoCalled.clear();
      this.clearMarksOnly();
    }
    this.currentNumber = r.called.length ? r.called[r.called.length - 1] : null;
    if (this.autoDaub && !this.waitingForNextRound) this.applyAutoDaub();
    this.phase = this.waitingForNextRound ? 'waitingRound' : 'playing';
    store.upsertCards(this.cards);
    this.persistRound();
    this.persistSession('playing');
    this.checkAutoBingo();
    this.toast(
      this.waitingForNextRound
        ? `Round ${r.number} continues. You play from the next round.`
        : resumed
          ? `Round ${r.number} resumed`
          : `Round ${r.number}: ${patternLabelOf(r)}`,
    );
  }

  private onNumber(d: JsonMap) {
    const r = this.round;
    if (!r) return;
    const n = typeof d.value === 'number' ? num(d.value) : null;
    if (Array.isArray(d.called)) r.called = d.called.map((x) => num(x));
    else if (n != null && !r.called.includes(n)) r.called.push(n);
    this.currentNumber = n;
    if (this.autoDaub && !this.waitingForNextRound) this.applyAutoDaub();
    store.upsertCards(this.cards);
    this.persistRound();
    if (n != null) this.events.onNumber?.(n);
    this.checkAutoBingo();
  }

  private applyAutoDaub() {
    const set = new Set(this.called);
    for (const c of this.cards) {
      for (const n of cardNumbers(c.grid)) {
        if (set.has(n) && !c.marked.includes(n)) c.marked.push(n);
      }
    }
  }

  setAutoDaub(on: boolean) {
    this.autoDaub = on;
    if (on && !this.waitingForNextRound) {
      this.applyAutoDaub();
      store.upsertCards(this.cards);
      this.checkAutoBingo();
    }
    this.notify();
  }

  toggleMark(cardId: string, number: number) {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card || number === 0) return;
    if (this.phase !== 'playing') {
      this.toast(
        this.phase === 'waitingRound'
          ? 'You joined mid-round. You play from the next round.'
          : this.phase === 'reconnecting'
            ? 'Reconnecting to the host...'
            : 'Marks open when the round starts.',
      );
      return;
    }
    if (!this.called.includes(number)) {
      this.toast(`${letterFor(number)}-${number} has not been called yet.`);
      return;
    }
    if (card.marked.includes(number)) card.marked = card.marked.filter((n) => n !== number);
    else card.marked.push(number);
    store.upsertCard(card);
    this.checkAutoBingo();
    this.notify();
  }

  /** Calls BINGO automatically for the first card that completes the pattern. */
  private checkAutoBingo() {
    const r = this.round;
    if (!r || !this.canStillClaim || this.claimPending) return;
    for (const c of this.cards) {
      if (this.autoCalled.has(c.id)) continue;
      if (isSatisfied(r.pattern, c)) {
        this.autoCalled.add(c.id);
        this.claimBingo(c.id);
        this.events.onAutoBingo?.(c);
        return;
      }
    }
  }

  canClaim(card: BingoCard): boolean {
    return this.canStillClaim && !this.claimPending && !!this.round && isSatisfied(this.round.pattern, card);
  }

  claimBingo(cardId: string) {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card || !this.canStillClaim || this.claimPending) return;
    this.claimPending = true;
    this.lastClaimReason = null;
    this.client.send(Msg.claim, {
      card: { id: card.id, owner: card.owner, name: card.name, grid: card.grid, marked: card.marked, sessionId: card.sessionId },
    });
    this.notify();
  }

  private onClaimResult(d: JsonMap) {
    this.claimPending = false;
    this.lastClaimValid = d.valid === true;
    this.lastClaimReason = str(d.reason) || null;
    if (this.lastClaimValid) {
      this.highlightCardId = str(d.cardId) || null;
      this.highlightCells = Array.isArray(d.cells) ? d.cells.map((c) => num(c)) : [];
    } else {
      this.events.onClaimRejected?.(this.lastClaimReason ?? 'The host rejected that claim.');
      this.checkAutoBingo(); // another of this player's cards may still be complete
    }
  }

  /** Asks the host to deal [count] cards; empty when the host does not answer. */
  private requestDeal(count: number): Promise<Grid[]> {
    if (!this.client.isConnected) return Promise.resolve([]);
    const id = `d${++this.dealSeq}`;
    return new Promise<Grid[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.deals.delete(id);
        resolve([]);
      }, 4000);
      this.deals.set(id, {
        resolve: (g) => {
          clearTimeout(timer);
          resolve(g);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.client.send(Msg.dealRequest, { count, reqId: id });
    });
  }

  /** The host found another player holding this exact card: deal fresh numbers. */
  private async onDuplicateCard(d: JsonMap) {
    const id = str(d.cardId);
    const card = this.cards.find((c) => c.id === id);
    if (!card) return;
    let dealt: Grid[] = [];
    try {
      dealt = await this.requestDeal(1);
    } catch {
      dealt = [];
    }
    if (this.disposed) return;
    card.grid = dealt[0] ?? uniqueRandomGrid(new Set(this.cards.map((c) => fingerprintOf(c.grid))));
    card.marked = [];
    if (this.autoDaub && this.inRound) this.applyAutoDaub();
    store.upsertCard(card);
    this.sendCardCount();
    this.toast(`${card.name} was too much like another player's card, so the host dealt you new numbers.`);
    this.notify();
  }

  private onGameWon(d: JsonMap) {
    let list = Array.isArray(d.winners) ? parseWinners(d.winners, this.playerName) : [];
    if (list.length === 0 && d.winner && typeof d.winner === 'object') {
      list = parseWinners([d.winner], this.playerName);
    }
    if (list.length === 0) return;
    const firstTime = this.phase !== 'won';
    this.winners = list;
    const r = this.round;
    if (r) {
      r.status = 'won';
      r.winners = [...list];
      r.winnerName = winnerNames(list);
      r.endedAt = new Date().toISOString();
      this.persistRound();
    }
    this.waitingForNextRound = false;
    this.phase = 'won';
    this.persistSession('lobby');
    if (firstTime) this.events.onWin?.(list[0]);
    this.checkAutoBingo(); // one of my cards may have completed on the same ball
  }

  private onPaused(d: JsonMap) {
    const r = this.round;
    if (r && r.status === 'playing') {
      r.status = 'paused';
      this.persistRound();
    }
    this.phase = 'paused';
    this.error = str(d.reason) || null;
    this.persistSession('paused');
    this.toast('The host saved the game. This player rejoins automatically when it resumes.');
  }

  private onStopped(d: JsonMap) {
    const r = this.round;
    if (r) {
      r.status = 'stopped';
      r.endedAt = new Date().toISOString();
      this.persistRound();
    }
    this.round = null;
    this.currentNumber = null;
    this.waitingForNextRound = false;
    this.phase = 'lobby';
    this.clearMarks();
    this.persistSession('lobby');
    this.toast(str(d.reason, 'The host ended the round.'));
  }

  /** After the win screen, wait in the lobby for the next round with clean cards. */
  backToLobby() {
    if (this.phase !== 'won') return;
    this.round = null;
    this.currentNumber = null;
    this.winners = [];
    this.highlightCells = [];
    this.highlightCardId = null;
    this.phase = 'lobby';
    this.clearMarks();
    this.notify();
  }

  private clearMarksOnly() {
    for (const c of this.cards) c.marked = [];
  }

  private clearMarks() {
    this.clearMarksOnly();
    store.upsertCards(this.cards);
  }

  // -------------------------------------------------------------------- cards

  async addRandomCard(): Promise<BingoCard | null> {
    if (!this.canAddCards) {
      this.toast('Cards can only be added between rounds.');
      return null;
    }
    if (this.cards.length >= 6) {
      this.toast('You can play up to 6 cards at once.');
      return null;
    }
    let dealt: Grid[];
    try {
      dealt = await this.requestDeal(1);
    } catch {
      return null; // the host refused: a round is running
    }
    if (this.disposed || !this.canAddCards) return null;
    const c = newCard({
      owner: this.playerName,
      name: `Card ${this.cards.length + 1}`,
      grid: dealt[0] ?? uniqueRandomGrid(new Set(this.cards.map((x) => fingerprintOf(x.grid)))),
      sessionId: this.localSessionId,
    });
    this.cards.push(c);
    if (this.autoDaub && this.inRound) this.applyAutoDaub();
    store.upsertCard(c);
    this.sendCardCount();
    this.toast(`${c.name} dealt`);
    this.notify();
    return c;
  }

  removeCard(cardId: string) {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    this.cards = this.cards.filter((c) => c.id !== cardId);
    store.deleteCard(cardId);
    this.sendCardCount();
    this.notify();
  }

  renameCard(cardId: string, name: string) {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    card.name = name.trim() || card.name;
    store.upsertCard(card);
    this.notify();
  }

  /** Reports this player's cards (count and layouts) so the host keeps every card unique. */
  private sendCardCount() {
    this.client.send(Msg.cards, {
      count: this.cards.length,
      cards: this.cards.map((c) => ({ id: c.id, grid: c.grid })),
    });
  }

  // -------------------------------------------------------------- persistence

  private persistSession(status: SessionStatus) {
    if (!this.sessionId) return;
    const now = new Date().toISOString();
    const s: GameSession = (this.localSession ??= store.session(this.localSessionId) ?? {
      id: this.localSessionId,
      name: this.sessionName,
      hostName: this.hostName,
      role: 'player',
      status,
      code: this.code,
      hostAddress: null,
      players: [],
      ownerClientId: this.clientId,
      ownerName: this.playerName,
      createdAt: now,
      updatedAt: now,
      endedAt: null,
    });
    s.status = status;
    s.name = this.sessionName;
    s.hostName = this.hostName;
    s.hostAddress = `${this.host}:${this.port}`;
    s.players = this.players.map((p) => p.name);
    s.ownerClientId = this.clientId;
    s.ownerName = this.playerName;
    if (status === 'finished') s.endedAt = now;
    store.upsertSession(s);
  }

  private persistRound() {
    if (this.round) store.upsertRound(this.round);
  }

  leave() {
    this.clearTimer('heartbeat');
    this.clearTimer('reconnect');
    this.clearTimer('welcome');
    this.client.send(Msg.leave);
    this.client.close();
  }

  dispose() {
    this.disposed = true;
    this.clearTimer('heartbeat');
    this.clearTimer('reconnect');
    this.clearTimer('welcome');
    this.client.close();
  }
}

function parsePlayers(raw: unknown): LobbyPlayer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      name: str((p as JsonMap).name, 'Player'),
      cardCount: num((p as JsonMap).cards),
      waiting: (p as JsonMap).waiting === true,
    }));
}

function parseWinners(raw: unknown, me: string): WinnerInfo[] {
  if (!Array.isArray(raw)) return [];
  const out: WinnerInfo[] = [];
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue;
    const j = w as JsonMap;
    let grid: Grid = [];
    try {
      grid = Array.isArray(j.grid) && j.grid.length ? decodeGrid(j.grid) : [];
    } catch {
      grid = [];
    }
    const name = str(j.playerName, 'Player');
    out.push({
      playerName: name,
      cardName: str(j.cardName, 'Card'),
      grid,
      cells: Array.isArray(j.cells) ? j.cells.map((c) => num(c)) : [],
      pattern: patternFromKey(str(j.pattern)),
      roundNumber: num(j.roundNumber, 1),
      calledCount: num(j.calledCount),
      isMe: name.toLowerCase() === me.toLowerCase(),
    });
  }
  return out;
}

function patternLabelOf(r: GameRound): string {
  switch (r.pattern) {
    case 'blackout':
      return 'Blackout';
    case 'lucky7':
      return 'Lucky 7';
    case 'lucky9':
      return 'Lucky 9';
    default:
      return 'Straight & Diagonal';
  }
}

export { copyCard };
