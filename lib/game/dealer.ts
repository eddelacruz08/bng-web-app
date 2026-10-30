import { type Grid, fingerprintOf, randomGrid, sharesAColumn } from './card';
import { secureRandom, shuffle } from './ids';

/**
 * Deals cards whose columns differ as much as possible from the cards
 * already in play: for every letter it picks the numbers that the other
 * cards use least, breaking ties at random. With up to three cards in a
 * lobby no two cards share a number in any column; after that repeats are
 * spread as evenly as the 15 numbers per column allow.
 */
export class CardDealer {
  constructor(private readonly rng: () => number = secureRandom) {}

  deal(existing: Iterable<Grid>): Grid {
    const inPlay = [...existing];
    const uses = new Array<number>(76).fill(0);
    const taken = new Set<string>();
    for (const g of inPlay) {
      taken.add(fingerprintOf(g));
      for (const col of g) for (const n of col) if (n > 0 && n <= 75) uses[n]++;
    }
    const acceptable = (g: Grid) => !taken.has(fingerprintOf(g)) && !inPlay.some((x) => sharesAColumn(x, g));

    for (let attempt = 0; attempt < 400; attempt++) {
      const spread = 1 + attempt / 25;
      const grid: Grid = Array.from({ length: 5 }, (_, c) => {
        const pool = Array.from({ length: 15 }, (_, i) => c * 15 + i + 1);
        const score = new Map(pool.map((n) => [n, uses[n] + this.rng() * spread]));
        pool.sort((a, b) => (score.get(a) as number) - (score.get(b) as number));
        const picked = shuffle(pool.slice(0, c === 2 ? 4 : 5), this.rng);
        if (c === 2) picked.splice(2, 0, 0);
        return picked;
      });
      if (acceptable(grid)) return grid;
    }
    for (;;) {
      const g = randomGrid(this.rng);
      if (acceptable(g)) return g;
    }
  }

  /** Deals [count] cards one after another, each avoiding the previous ones too. */
  dealMany(existing: Iterable<Grid>, count: number): Grid[] {
    const all = [...existing];
    const out: Grid[] = [];
    for (let i = 0; i < count; i++) {
      const g = this.deal(all);
      all.push(g);
      out.push(g);
    }
    return out;
  }
}
