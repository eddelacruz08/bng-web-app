/** Short unique ids: time in base 36 plus random bits, like the mobile app. */
export function newId(prefix = ''): string {
  const t = Date.now().toString(36);
  const r = Math.floor(secureRandom() * 0xfffff).toString(36);
  return `${prefix}${t}${r}`;
}

/** 4-digit room code shown to players. */
export function newCode(): string {
  return Array.from({ length: 4 }, () => Math.floor(secureRandom() * 10)).join('');
}

/**
 * Uniform random in [0, 1) from the platform's secure generator (browser and
 * Node both expose `globalThis.crypto`), so cards and calls can't be predicted.
 */
export function secureRandom(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
  return Math.random();
}

/** Fisher-Yates shuffle in place, with a pluggable random source. */
export function shuffle<T>(list: T[], rng: () => number = secureRandom): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Deterministic generator for tests (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
