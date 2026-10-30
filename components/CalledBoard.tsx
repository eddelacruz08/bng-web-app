'use client';

import { AnimatePresence, motion } from 'motion/react';

import { BINGO_LETTERS, letterFor } from '@/lib/game/card';
import { BALL_COLORS, Ball, onLetter } from './Ball';
import { cx } from './ui';

/** The 75-number master board, lit up as numbers are called. */
export function CalledBoard({ called, current, className }: { called: number[]; current: number | null; className?: string }) {
  const set = new Set(called);
  return (
    <div className={cx('flex flex-col gap-[3px]', className)}>
      {BINGO_LETTERS.map((letter, c) => (
        <div key={letter} className="flex items-center gap-1">
          <div
            className="flex size-6 shrink-0 items-center justify-center rounded-[5px] font-display text-[14px]"
            style={{ background: BALL_COLORS[letter], color: onLetter(letter) }}
          >
            {letter}
          </div>
          <div className="grid flex-1 grid-cols-15 gap-[2px]">
            {Array.from({ length: 15 }, (_, i) => {
              const n = c * 15 + i + 1;
              const isCalled = set.has(n);
              const isCurrent = current === n;
              return (
                <div
                  key={n}
                  className={cx(
                    'flex aspect-square items-center justify-center rounded-[4px] border-2 text-[clamp(8px,1.6vw,12px)] font-bold transition-all duration-300',
                    isCurrent ? 'border-gold shadow-[0_0_8px_rgba(201,162,39,.8)]' : 'border-transparent',
                  )}
                  style={{
                    background: isCalled ? BALL_COLORS[letter] : 'rgba(233,217,181,.55)',
                    color: isCalled ? onLetter(letter) : 'rgba(107,85,68,.75)',
                  }}
                >
                  {n}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The last few balls, newest first, sliding in as they are called. */
export function RecentCalls({ called, count = 6, size = 44 }: { called: number[]; count?: number; size?: number }) {
  const recent = [...called].reverse().slice(0, count);
  if (recent.length === 0) {
    return (
      <div className="flex items-center justify-center italic text-ink-soft" style={{ height: size + 8 }}>
        No numbers called yet
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-1 py-1" style={{ minHeight: size + 8 }}>
      <AnimatePresence initial={false} mode="popLayout">
        {recent.map((n, i) => (
          <motion.div
            key={n}
            layout
            initial={{ opacity: 0, x: -24, scale: 0.6 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            title={`${letterFor(n)}-${n}`}
          >
            <Ball number={n} size={size} dim={i > 0} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
