/**
 * Wire protocol shared with the Classic Bingo mobile app.
 * TCP: newline-delimited JSON objects {"t": type, "d": {...}}.
 * UDP: clients broadcast DISCOVERY_QUERY; hosts answer with lobby JSON.
 */
export const APP_TAG = 'classic_bingo';
export const GAME_PORT = 7575;
export const DISCOVERY_PORT = 7576;
export const DISCOVERY_QUERY = 'CLASSIC_BINGO_DISCOVER?';
export const PROTOCOL_VERSION = 1;
export const JOIN_SCHEME = 'classicbingo';

export const Msg = {
  // client -> host
  join: 'join',
  leave: 'leave',
  claim: 'claim',
  cards: 'cards',
  ping: 'ping',
  dealRequest: 'deal_request',
  // host -> client
  welcome: 'welcome',
  rejected: 'rejected',
  players: 'players',
  gameStart: 'game_start',
  number: 'number',
  claimResult: 'claim_result',
  gameWon: 'game_won',
  gamePaused: 'game_paused',
  gameStopped: 'game_stopped',
  sessionEnd: 'session_end',
  pong: 'pong',
  duplicateCard: 'duplicate_card',
  dealt: 'dealt',
} as const;

export type JsonMap = Record<string, unknown>;

export interface NetMessage {
  t: string;
  d: JsonMap;
}

export function encodeMessage(t: string, d: JsonMap = {}): string {
  return JSON.stringify({ t, d }) + '\n';
}

export function decodeMessage(line: string): NetMessage | null {
  try {
    const j = JSON.parse(line);
    if (!j || typeof j !== 'object' || typeof j.t !== 'string') return null;
    const d = j.d && typeof j.d === 'object' && !Array.isArray(j.d) ? (j.d as JsonMap) : {};
    return { t: j.t, d };
  } catch {
    return null;
  }
}

/** Payload carried by the lobby QR code: classicbingo://join?h=..&p=..&c=..&n=.. */
export interface JoinLink {
  host: string;
  port: number;
  code: string;
  name: string;
}

export function encodeJoinLink(link: JoinLink): string {
  const q = new URLSearchParams({ h: link.host, p: String(link.port), c: link.code, n: link.name });
  return `${JOIN_SCHEME}://join?${q.toString()}`;
}

export function parseJoinLink(raw: string): JoinLink | null {
  const text = raw.trim();
  const m = /^classicbingo:\/\/join\?(.*)$/i.exec(text);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const host = q.get('h') ?? '';
  const port = Number.parseInt(q.get('p') ?? '', 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, code: q.get('c') ?? '', name: q.get('n') ?? '' };
}

export const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIpv4(s: string): boolean {
  const m = IPV4.exec(s.trim());
  return !!m && m.slice(1).every((p) => Number(p) <= 255);
}

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/** An IPv4 address or a DNS name (for a lobby hosted on the internet). */
export function isValidHost(s: string): boolean {
  const t = s.trim();
  return isValidIpv4(t) || t === 'localhost' || HOSTNAME.test(t);
}
