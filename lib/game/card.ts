import { newId, secureRandom, shuffle } from './ids';

export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
export type Letter = (typeof BINGO_LETTERS)[number];

/** grid[col][row]; the centre (col 2, row 2) is the free space and holds 0. */
export type Grid = number[][];

export interface BingoCard {
  id: string;
  owner: string;
  name: string;
  grid: Grid;
  /** Numbers the player has daubed. */
  marked: number[];
  /** Session the card was used in, or null for a reusable "My Cards" template. */
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Column index 0-4 for a ball number 1-75. */
export function columnFor(n: number): number {
  return Math.min(4, Math.max(0, Math.floor((n - 1) / 15)));
}

/** Letter for a ball number 1-75. */
export function letterFor(n: number): Letter {
  return BINGO_LETTERS[columnFor(n)];
}

/** A valid random card: 5 unique numbers per column from that letter's range. */
export function randomGrid(rng: () => number = secureRandom): Grid {
  return Array.from({ length: 5 }, (_, c) => {
    const pool = shuffle(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1), rng);
    const col = pool.slice(0, 5);
    if (c === 2) col[2] = 0;
    return col;
  });
}

/** Identity of a layout: two cards with the same fingerprint are the same card. */
export function fingerprintOf(grid: Grid): string {
  return grid.map((c) => c.join(',')).join('|');
}

/** Numbers in one letter column, ignoring row order and the free space. */
export function columnSet(grid: Grid, col: number): Set<number> {
  return new Set(grid[col].filter((n) => n !== 0));
}

/**
 * True when the two cards hold exactly the same numbers in any letter column
 * (for example the same card with its rows shuffled). Such cards count as
 * copies: every player's columns must differ.
 */
export function sharesAColumn(a: Grid, b: Grid): boolean {
  for (let c = 0; c < 5; c++) {
    const x = columnSet(a, c);
    const y = columnSet(b, c);
    if (x.size === y.size && [...y].every((n) => x.has(n))) return true;
  }
  return false;
}

/** A random grid that differs from every fingerprint in [avoid]. */
export function uniqueRandomGrid(avoid: Set<string>): Grid {
  for (;;) {
    const g = randomGrid();
    if (!avoid.has(fingerprintOf(g))) return g;
  }
}

export function isFree(col: number, row: number): boolean {
  return col === 2 && row === 2;
}

/** All 24 real numbers on the card (free space excluded). */
export function cardNumbers(grid: Grid): number[] {
  return grid.flatMap((col) => col.filter((n) => n !== 0));
}

export function isMarked(card: Pick<BingoCard, 'grid' | 'marked'>, col: number, row: number): boolean {
  return isFree(col, row) || card.marked.includes(card.grid[col][row]);
}

/** marked[col][row], with the free space always true. */
export function markedMatrix(card: Pick<BingoCard, 'grid' | 'marked'>): boolean[][] {
  const set = new Set(card.marked);
  return card.grid.map((col, c) => col.map((n, r) => isFree(c, r) || set.has(n)));
}

/** Number of real (non-free) cells currently marked. */
export function markedCount(card: Pick<BingoCard, 'grid' | 'marked'>): number {
  const set = new Set(card.marked);
  return cardNumbers(card.grid).filter((n) => set.has(n)).length;
}

/** Validation errors for a grid; an empty list means the card is legal. */
export function validateGrid(grid: Grid): string[] {
  const errors: string[] = [];
  if (grid.length !== 5 || grid.some((c) => c.length !== 5)) return ['Card must be 5 by 5.'];
  for (let c = 0; c < 5; c++) {
    const lo = c * 15 + 1;
    const hi = c * 15 + 15;
    const seen = new Set<number>();
    for (let r = 0; r < 5; r++) {
      const n = grid[c][r];
      if (c === 2 && r === 2) {
        if (n !== 0) errors.push('The centre must stay the FREE space.');
        continue;
      }
      if (!Number.isInteger(n) || n < lo || n > hi) {
        errors.push(`${BINGO_LETTERS[c]} column, row ${r + 1}: use ${lo} to ${hi}.`);
        continue;
      }
      if (seen.has(n)) errors.push(`${BINGO_LETTERS[c]} column repeats ${n}.`);
      seen.add(n);
    }
  }
  return errors;
}

/** Reads a grid from JSON (array or string), throwing on anything malformed. */
export function decodeGrid(raw: unknown): Grid {
  const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(list) || list.length !== 5) throw new Error('bad grid');
  return list.map((col) => {
    if (!Array.isArray(col) || col.length !== 5) throw new Error('bad grid');
    return col.map((n) => {
      const v = Number(n);
      if (!Number.isFinite(v)) throw new Error('bad grid');
      return Math.trunc(v);
    });
  });
}

export function newCard(args: {
  owner: string;
  name?: string;
  grid?: Grid;
  sessionId?: string | null;
}): BingoCard {
  const now = new Date().toISOString();
  return {
    id: newId(),
    owner: args.owner,
    name: args.name ?? 'Card',
    grid: args.grid ?? randomGrid(),
    marked: [],
    sessionId: args.sessionId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep copy of a card, optionally with a fresh id, session or no marks. */
export function copyCard(
  card: BingoCard,
  changes: { id?: string; sessionId?: string | null; clearMarks?: boolean; name?: string } = {},
): BingoCard {
  return {
    ...card,
    id: changes.id ?? card.id,
    name: changes.name ?? card.name,
    grid: card.grid.map((c) => [...c]),
    marked: changes.clearMarks ? [] : [...card.marked],
    sessionId: changes.sessionId === undefined ? card.sessionId : changes.sessionId,
    updatedAt: new Date().toISOString(),
  };
}
