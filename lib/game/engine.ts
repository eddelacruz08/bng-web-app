import { type BingoCard, cardNumbers, validateGrid } from './card';
import { secureRandom, shuffle } from './ids';
import { type WinPattern, PATTERNS, targetCount, winningCells } from './pattern';

/** Result of checking a BINGO claim against the called numbers. */
export interface ClaimVerdict {
  valid: boolean;
  reason: string;
  /** Winning cells as col * 5 + row. */
  cells: number[];
}

/**
 * Host-side truth: a card wins when the numbers printed on it that have
 * actually been called complete the pattern. Player marks are not trusted.
 */
export function verifyClaim(args: {
  card: Pick<BingoCard, 'grid'>;
  called: Set<number>;
  pattern: WinPattern;
}): ClaimVerdict {
  const { card, called, pattern } = args;
  if (validateGrid(card.grid).length > 0) {
    return { valid: false, reason: 'That card is not a legal bingo card.', cells: [] };
  }
  const effective = { grid: card.grid, marked: cardNumbers(card.grid).filter((n) => called.has(n)) };
  const cells = winningCells(pattern, effective);
  if (cells.size === 0) {
    const target = targetCount(pattern);
    if (target != null) {
      return {
        valid: false,
        reason: `Only ${effective.marked.length} of ${target} called numbers on this card.`,
        cells: [],
      };
    }
    return { valid: false, reason: `${PATTERNS[pattern].label} is not complete on this card.`, cells: [] };
  }
  return { valid: true, reason: 'BINGO confirmed!', cells: [...cells].sort((a, b) => a - b) };
}

/** Pure game logic: shuffles 1-75, draws the next ball, verifies claims. */
export class GameEngine {
  readonly pattern: WinPattern;
  readonly called: number[];
  private remaining: number[];
  private readonly rng: () => number;

  constructor(pattern: WinPattern, called: number[] = [], rng: () => number = secureRandom) {
    this.pattern = pattern;
    this.called = [...called];
    this.rng = rng;
    const used = new Set(this.called);
    this.remaining = shuffle(
      Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !used.has(n)),
      rng,
    );
  }

  get calledSet(): Set<number> {
    return new Set(this.called);
  }

  get remainingCount(): number {
    return this.remaining.length;
  }

  get isExhausted(): boolean {
    return this.remaining.length === 0;
  }

  /** Draws the next random ball, or null when all 75 have been called. */
  callNext(): number | null {
    const n = this.remaining.pop();
    if (n === undefined) return null;
    this.called.push(n);
    return n;
  }

  /** Takes the most recent call back and returns the ball to the cage. */
  undoLast(): number | null {
    const n = this.called.pop();
    if (n === undefined) return null;
    this.remaining.push(n);
    shuffle(this.remaining, this.rng);
    return n;
  }

  verify(card: Pick<BingoCard, 'grid'>): ClaimVerdict {
    return verifyClaim({ card, called: this.calledSet, pattern: this.pattern });
  }
}
