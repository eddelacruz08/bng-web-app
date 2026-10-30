'use client';

import { PATTERNS, PATTERN_LIST, patternPreview, targetCount, type WinPattern } from '@/lib/game/pattern';
import type { useDialogs } from './Providers';
import { Icon, cx } from './ui';

/** Tiny 5x5 picture of a winning pattern; count patterns show their number. */
export function PatternPreview({
  pattern,
  size = 56,
  color = '#7a1e2b',
  altColor = '#c9a227',
}: {
  pattern: WinPattern;
  size?: number;
  color?: string;
  altColor?: string;
}) {
  const p = patternPreview(pattern);
  const target = targetCount(pattern);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="grid h-full w-full grid-cols-5 gap-[2px]">
        {Array.from({ length: 25 }, (_, i) => {
          const r = Math.floor(i / 5);
          const c = i % 5;
          const v = p[c][r];
          return <div key={i} className="rounded-[2px]" style={{ background: v === 1 ? color : v === 2 ? altColor : '#e9d9b5' }} />;
        })}
      </div>
      {target != null && (
        <div
          className="absolute inset-0 m-auto flex items-center justify-center rounded-full border-2 font-display text-cream"
          style={{ width: size * 0.6, height: size * 0.6, background: color, borderColor: altColor, fontSize: size * 0.34 }}
        >
          {target}
        </div>
      )}
    </div>
  );
}

export function PatternList({ selected, onPick }: { selected?: WinPattern; onPick: (p: WinPattern) => void }) {
  return (
    <div className="flex flex-col">
      {PATTERN_LIST.map((p) => (
        <button
          key={p}
          onClick={() => onPick(p)}
          className={cx(
            'flex items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors hover:bg-burgundy/6 active:bg-burgundy/10',
            selected === p && 'bg-gold/10',
          )}
        >
          <PatternPreview pattern={p} size={48} />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold text-ink">{PATTERNS[p].label}</span>
            <span className="block text-[13.5px] text-ink-soft">{PATTERNS[p].description}</span>
          </span>
          {selected === p && <Icon.Check className="size-6 shrink-0 text-gold" />}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet listing every winning combination; resolves to the pick or null. */
export function pickPattern(dialogs: ReturnType<typeof useDialogs>, selected?: WinPattern): Promise<WinPattern | null> {
  return dialogs.custom<WinPattern>(
    (close) => (
      <div className="px-2 pt-3">
        <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-gold" />
        <h2 className="px-3 pb-1 font-display text-[18px] text-burgundy">Choose the winning combination</h2>
        <PatternList selected={selected} onPick={(p) => close(p)} />
      </div>
    ),
    { sheet: true },
  );
}
