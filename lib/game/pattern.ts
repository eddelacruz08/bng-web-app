import { type BingoCard, isFree, markedCount, markedMatrix } from './card';

/** Winning combinations the caller can choose for a round. */
export type WinPattern = 'straightDiagonal' | 'blackout' | 'lucky7' | 'lucky9';

export const PATTERN_LIST: WinPattern[] = ['straightDiagonal', 'blackout', 'lucky7', 'lucky9'];

export const PATTERNS: Record<WinPattern, { label: string; description: string }> = {
  straightDiagonal: {
    label: 'Straight & Diagonal',
    description:
      'A full row or column, a full corner-to-corner diagonal, or any complete shorter diagonal: ' +
      'the four 4-number diagonals and the four 3-number diagonals.',
  },
  blackout: { label: 'Blackout', description: 'Every number on the card.' },
  lucky7: { label: 'Lucky 7', description: 'Any 7 numbers on one card. Whoever reaches 7 first wins.' },
  lucky9: { label: 'Lucky 9', description: 'Any 9 numbers on one card. Whoever reaches 9 first wins.' },
};

/** Older rounds used separate line patterns; they all map to the combined one now. */
const LEGACY = new Set(['anyLine', 'straight', 'diagonal', 'diamond']);

export function patternFromKey(key: string | null | undefined): WinPattern {
  if (key && LEGACY.has(key)) return 'straightDiagonal';
  return (PATTERN_LIST as string[]).includes(key ?? '') ? (key as WinPattern) : 'straightDiagonal';
}

export function patternLabel(p: WinPattern): string {
  return PATTERNS[p].label;
}

/** Lucky patterns are count based; others are shape based. */
export function targetCount(p: WinPattern): number | null {
  return p === 'lucky7' ? 7 : p === 'lucky9' ? 9 : null;
}

/** The four 3-number diagonals (the diamond outline), as col * 5 + row. */
export const DIAMOND_EDGES = [
  [2 * 5 + 0, 1 * 5 + 1, 0 * 5 + 2],
  [2 * 5 + 0, 3 * 5 + 1, 4 * 5 + 2],
  [0 * 5 + 2, 1 * 5 + 3, 2 * 5 + 4],
  [4 * 5 + 2, 3 * 5 + 3, 2 * 5 + 4],
];

/** The four 4-number diagonals, one step in from each corner diagonal. */
export const FOUR_DIAGONALS = [
  [1 * 5 + 0, 2 * 5 + 1, 3 * 5 + 2, 4 * 5 + 3],
  [0 * 5 + 1, 1 * 5 + 2, 2 * 5 + 3, 3 * 5 + 4],
  [3 * 5 + 0, 2 * 5 + 1, 1 * 5 + 2, 0 * 5 + 3],
  [4 * 5 + 1, 3 * 5 + 2, 2 * 5 + 3, 1 * 5 + 4],
];

function fullLine(m: boolean[][]): Set<number> {
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => m[c][r])) return new Set([0, 1, 2, 3, 4].map((c) => c * 5 + r));
  }
  for (let c = 0; c < 5; c++) {
    if (m[c].every(Boolean)) return new Set([0, 1, 2, 3, 4].map((r) => c * 5 + r));
  }
  if ([0, 1, 2, 3, 4].every((i) => m[i][i])) return new Set([0, 1, 2, 3, 4].map((i) => i * 5 + i));
  if ([0, 1, 2, 3, 4].every((i) => m[i][4 - i])) return new Set([0, 1, 2, 3, 4].map((i) => i * 5 + (4 - i)));
  return new Set();
}

function shortDiagonal(m: boolean[][]): Set<number> {
  for (const line of [...FOUR_DIAGONALS, ...DIAMOND_EDGES]) {
    if (line.every((i) => m[Math.floor(i / 5)][i % 5])) return new Set(line);
  }
  return new Set();
}

/** Cells (col * 5 + row) that complete the pattern, or an empty set if not won. */
export function winningCells(p: WinPattern, card: Pick<BingoCard, 'grid' | 'marked'>): Set<number> {
  const m = markedMatrix(card);
  switch (p) {
    case 'straightDiagonal': {
      const line = fullLine(m);
      return line.size > 0 ? line : shortDiagonal(m);
    }
    case 'blackout': {
      for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) if (!m[c][r]) return new Set();
      return new Set(Array.from({ length: 25 }, (_, i) => i));
    }
    case 'lucky7':
    case 'lucky9': {
      if (markedCount(card) < (targetCount(p) as number)) return new Set();
      const out = new Set<number>();
      for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) if (!isFree(c, r) && m[c][r]) out.add(c * 5 + r);
      return out;
    }
  }
}

export function isSatisfied(p: WinPattern, card: Pick<BingoCard, 'grid' | 'marked'>): boolean {
  return winningCells(p, card).size > 0;
}

/**
 * Picker preview as cells[col][row]: 0 = empty, 1 = primary shape,
 * 2 = alternative shape. Count-based patterns show their number instead.
 */
export function patternPreview(p: WinPattern): number[][] {
  const grid = Array.from({ length: 5 }, () => Array(5).fill(0) as number[]);
  if (p === 'straightDiagonal') {
    for (let c = 0; c < 5; c++) grid[c][4] = 1;
    for (const i of FOUR_DIAGONALS[0]) grid[Math.floor(i / 5)][i % 5] = 2;
  } else if (p === 'blackout') {
    for (const col of grid) col.fill(1);
  }
  return grid;
}
