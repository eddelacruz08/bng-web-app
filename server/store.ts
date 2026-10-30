import fs from 'node:fs';
import path from 'node:path';

import type { BingoCard } from '../lib/game/card';
import type { GameRound, GameSession, Profile } from '../lib/game/types';

/**
 * Everything the web app remembers lives as JSON files in the project's
 * `data/` folder (one file per table), so a game night is easy to inspect,
 * back up or wipe. Writes are coalesced and atomic (write temp, rename).
 */
export const DATA_DIR = process.env.BINGO_DATA_DIR ?? path.join(process.cwd(), 'data');

interface Tables {
  profiles: Profile[];
  sessions: GameSession[];
  rounds: GameRound[];
  cards: BingoCard[];
  settings: Record<string, string>;
}

const DEFAULTS: Tables = { profiles: [], sessions: [], rounds: [], cards: [], settings: {} };

class JsonStore {
  private tables: Tables;
  private dirty = new Set<keyof Tables>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.tables = {
      profiles: this.load('profiles'),
      sessions: this.load('sessions'),
      rounds: this.load('rounds'),
      cards: this.load('cards'),
      settings: this.load('settings'),
    };
    process.once('beforeExit', () => this.flushNow());
  }

  private file(name: keyof Tables): string {
    return path.join(DATA_DIR, `${name}.json`);
  }

  private load<K extends keyof Tables>(name: K): Tables[K] {
    try {
      const raw = fs.readFileSync(this.file(name), 'utf8');
      const parsed = JSON.parse(raw);
      if (name === 'settings') {
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as Tables[K];
      }
      return (Array.isArray(parsed) ? parsed : []) as Tables[K];
    } catch {
      return structuredClone(DEFAULTS[name]);
    }
  }

  private touch(name: keyof Tables) {
    this.dirty.add(name);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flushNow(), 40);
  }

  /** Writes every changed table. Safe to call at any time. */
  flushNow() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const name of this.dirty) {
      const target = this.file(name);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.tables[name], null, 2));
      fs.renameSync(tmp, target);
    }
    this.dirty.clear();
  }

  // ---------------------------------------------------------------- profiles

  profiles(): Profile[] {
    return [...this.tables.profiles].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  upsertProfile(p: Profile) {
    const i = this.tables.profiles.findIndex((x) => x.id === p.id);
    if (i >= 0) this.tables.profiles[i] = p;
    else this.tables.profiles.push(p);
    this.touch('profiles');
  }

  deleteProfile(id: string) {
    this.tables.profiles = this.tables.profiles.filter((p) => p.id !== id);
    this.touch('profiles');
  }

  // ---------------------------------------------------------------- settings

  getSetting(key: string): string | null {
    return this.tables.settings[key] ?? null;
  }

  setSetting(key: string, value: string | null) {
    if (value == null) delete this.tables.settings[key];
    else this.tables.settings[key] = value;
    this.touch('settings');
  }

  allSettings(): Record<string, string> {
    return { ...this.tables.settings };
  }

  // ---------------------------------------------------------------- sessions

  sessions(): GameSession[] {
    return [...this.tables.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  session(id: string): GameSession | null {
    return this.tables.sessions.find((s) => s.id === id) ?? null;
  }

  upsertSession(s: GameSession) {
    s.updatedAt = new Date().toISOString();
    const i = this.tables.sessions.findIndex((x) => x.id === s.id);
    if (i >= 0) this.tables.sessions[i] = s;
    else this.tables.sessions.push(s);
    this.touch('sessions');
  }

  /** Removes a session with its rounds and in-game cards. */
  deleteSession(id: string) {
    this.tables.sessions = this.tables.sessions.filter((s) => s.id !== id);
    this.tables.rounds = this.tables.rounds.filter((r) => r.sessionId !== id);
    this.tables.cards = this.tables.cards.filter((c) => c.sessionId !== id);
    this.touch('sessions');
    this.touch('rounds');
    this.touch('cards');
  }

  /** Clears every session, round and in-game card; "My Cards" templates stay. */
  clearHistory() {
    this.tables.sessions = [];
    this.tables.rounds = [];
    this.tables.cards = this.tables.cards.filter((c) => c.sessionId == null);
    this.touch('sessions');
    this.touch('rounds');
    this.touch('cards');
  }

  // ------------------------------------------------------------------- rounds

  roundsFor(sessionId: string): GameRound[] {
    return this.tables.rounds.filter((r) => r.sessionId === sessionId).sort((a, b) => a.number - b.number);
  }

  latestRound(sessionId: string): GameRound | null {
    const list = this.roundsFor(sessionId);
    return list.length ? list[list.length - 1] : null;
  }

  roundCount(sessionId: string): number {
    return this.tables.rounds.filter((r) => r.sessionId === sessionId).length;
  }

  roundCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.tables.rounds) out[r.sessionId] = (out[r.sessionId] ?? 0) + 1;
    return out;
  }

  upsertRound(r: GameRound) {
    r.updatedAt = new Date().toISOString();
    const i = this.tables.rounds.findIndex((x) => x.id === r.id);
    if (i >= 0) this.tables.rounds[i] = r;
    else this.tables.rounds.push(r);
    this.touch('rounds');
  }

  // -------------------------------------------------------------------- cards

  /** Reusable cards owned by a player (not tied to a session). */
  templateCards(owner: string): BingoCard[] {
    return this.tables.cards
      .filter((c) => c.sessionId == null && c.owner === owner)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  card(id: string): BingoCard | null {
    return this.tables.cards.find((c) => c.id === id) ?? null;
  }

  /** Cards (with marks) a player used in one session. */
  sessionCards(sessionId: string, owner: string): BingoCard[] {
    return this.tables.cards
      .filter((c) => c.sessionId === sessionId && c.owner === owner)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  upsertCard(c: BingoCard) {
    c.updatedAt = new Date().toISOString();
    const i = this.tables.cards.findIndex((x) => x.id === c.id);
    if (i >= 0) this.tables.cards[i] = c;
    else this.tables.cards.push(c);
    this.touch('cards');
  }

  upsertCards(cards: Iterable<BingoCard>) {
    for (const c of cards) this.upsertCard(c);
  }

  deleteCard(id: string) {
    this.tables.cards = this.tables.cards.filter((c) => c.id !== id);
    this.touch('cards');
  }
}

declare global {
  var __bingoStore: JsonStore | undefined;
}

/** One store per process, shared by the custom server and anything else that imports it. */
export const store: JsonStore = (globalThis.__bingoStore ??= new JsonStore());
