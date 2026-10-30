import type { BingoCard, Grid } from './card';
import type { WinPattern } from './pattern';

export type SessionRole = 'host' | 'player' | 'caller';
export type SessionStatus = 'lobby' | 'playing' | 'paused' | 'finished';
export type GameStatus = 'playing' | 'paused' | 'won' | 'stopped';

export interface Profile {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export const PROFILE_PALETTE = [
  '#7A1E2B',
  '#1E4D8C',
  '#2E7D4F',
  '#E0A526',
  '#6A1B9A',
  '#00838F',
  '#BF360C',
  '#4E342E',
];

/** One hosting, joining or calling session. A session holds many rounds. */
export interface GameSession {
  id: string;
  name: string;
  hostName: string;
  role: SessionRole;
  status: SessionStatus;
  code: string;
  hostAddress: string | null;
  players: string[];
  /** Browser that owns a player session (so only it can rejoin), and the name it played under. */
  ownerClientId: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

/** Who won a round and with which card. */
export interface WinnerInfo {
  playerName: string;
  cardName: string;
  /** Empty for a paper-card winner recorded by the caller. */
  grid: Grid;
  cells: number[];
  pattern: WinPattern;
  roundNumber: number;
  calledCount: number;
  isMe?: boolean;
}

export function isPaperWinner(w: WinnerInfo): boolean {
  return w.grid.length === 0;
}

export function winnerNames(winners: WinnerInfo[]): string {
  const n = winners.map((w) => w.playerName);
  if (n.length === 0) return '';
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`;
}

/** One round of bingo inside a session. */
export interface GameRound {
  id: string;
  sessionId: string;
  number: number;
  pattern: WinPattern;
  called: number[];
  /** Players in the lobby when the round started; others wait for the next one. */
  participants: string[];
  winners: WinnerInfo[];
  status: GameStatus;
  winnerName: string | null;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export function roundIsOpen(r: GameRound | null | undefined): boolean {
  return !!r && (r.status === 'playing' || r.status === 'paused');
}

export function roundHasWinner(r: GameRound, name: string): boolean {
  const lc = name.toLowerCase();
  return r.winners.some((w) => w.playerName.toLowerCase() === lc);
}

export function roundIsParticipant(r: GameRound, name: string): boolean {
  const lc = name.toLowerCase();
  return r.participants.some((p) => p.toLowerCase() === lc);
}

/** A player as seen in the lobby list. */
export interface LobbyPlayer {
  name: string;
  cardCount: number;
  address?: string;
  /** Connected during a round; plays from the next round. */
  waiting: boolean;
}

/** A BINGO claim the host received (valid or not), for the host's log. */
export interface ClaimEvent {
  playerName: string;
  cardName: string;
  valid: boolean;
  reason: string;
  at: string;
}

export type PlayerPhase =
  | 'connecting'
  | 'reconnecting'
  | 'lobby'
  | 'waitingRound'
  | 'playing'
  | 'paused'
  | 'won'
  | 'ended'
  | 'disconnected';

/** A lobby seen on the local network. */
export interface DiscoveredLobby {
  host: string;
  port: number;
  name: string;
  hostName: string;
  code: string;
  status: string;
  playerCount: number;
  seenAt: string;
}

export interface LanAddress {
  ip: string;
  iface: string;
  kind: 'wifi' | 'wired' | 'other';
}

// ------------------------------------------------------------ snapshots

/** Everything the browser needs to draw the caller's desk (host or Ball Caller). */
export interface HostSnapshot {
  kind: 'host' | 'caller';
  session: GameSession;
  round: GameRound | null;
  /** Called numbers as they should be shown (the tumbling ball is hidden). */
  called: number[];
  currentNumber: number | null;
  drawing: boolean;
  autoCall: boolean;
  autoCallSeconds: number;
  players: LobbyPlayer[];
  claims: ClaimEvent[];
  winners: WinnerInfo[];
  hostIp: string | null;
  addresses: LanAddress[];
  port: number;
  joinLink: string | null;
  /** Where browsers open this web app when it is hosted on the internet (PUBLIC_URL). */
  publicUrl: string | null;
  roundsPlayed: number;
  running: boolean;
  error: string | null;
}

/** Everything the browser needs to draw a player's screen. */
export interface PlayerSnapshot {
  clientId: string;
  playerName: string;
  host: string;
  port: number;
  phase: PlayerPhase;
  error: string | null;
  reconnectAttempts: number;
  sessionId: string;
  sessionName: string;
  hostName: string;
  code: string;
  players: LobbyPlayer[];
  round: GameRound | null;
  currentNumber: number | null;
  called: number[];
  cards: BingoCard[];
  winners: WinnerInfo[];
  claimPending: boolean;
  lastClaimReason: string | null;
  highlightCardId: string | null;
  highlightCells: number[];
  waitingForNextRound: boolean;
  autoDaub: boolean;
  canAddCards: boolean;
  canStillClaim: boolean;
}

/** Messages from the server to a browser. */
export type HubEvent =
  | { t: 'hello'; d: { clientId: string } }
  | { t: 'host_state'; d: HostSnapshot | null }
  | { t: 'caller_state'; d: HostSnapshot | null }
  | { t: 'player_state'; d: PlayerSnapshot | null }
  | { t: 'lobbies'; d: DiscoveredLobby[] }
  | { t: 'toast'; d: { message: string; slot?: string } }
  | { t: 'win'; d: { slot: 'host' | 'caller' | 'player'; winner: WinnerInfo } }
  | { t: 'auto_bingo'; d: { card: BingoCard } }
  | { t: 'claim_rejected'; d: { reason: string } }
  | { t: 'number'; d: { slot: 'host' | 'caller' | 'player'; value: number } }
  | { t: 'closed'; d: { slot: 'host' | 'caller' | 'player'; result: string } }
  | { t: 'error'; d: { message: string } };
