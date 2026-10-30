'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { BINGO_LETTERS, isFree, type BingoCard } from '@/lib/game/card';
import { BALL_COLORS, onLetter } from './Ball';
import { Icon, cx } from './ui';

/** A 5x5 bingo card with animated daubs and optional win highlight. */
export function BingoCardView({
  card,
  onCellTap,
  highlight,
  called,
  title,
  trailing,
  className,
  compact,
}: {
  card: Pick<BingoCard, 'grid' | 'marked'> & Partial<BingoCard>;
  onCellTap?: (col: number, row: number, number: number) => void;
  /** Cells (col * 5 + row) to glow gold, for a winning line. */
  highlight?: Set<number> | number[];
  /** When given, numbers that were called but not marked get a subtle ring. */
  called?: Set<number>;
  title?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const hl = highlight instanceof Set ? highlight : new Set(highlight ?? []);
  const marked = new Set(card.marked);
  return (
    <div className={cx('rounded-[14px] border-2 border-gold bg-cream shadow-[0_4px_10px_rgba(43,29,20,.25)]', compact ? 'p-2' : 'p-2.5', className)}>
      {(title || trailing) && (
        <div className="mb-1.5 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate font-display text-[15px] text-burgundy">{title}</div>
          {trailing}
        </div>
      )}
      <div className="grid grid-cols-5 gap-1">
        {BINGO_LETTERS.map((l) => (
          <div
            key={l}
            className="flex h-[30px] items-center justify-center rounded-md border border-black/15 font-display text-[18px]"
            style={{ background: BALL_COLORS[l], color: onLetter(l) }}
          >
            {l}
          </div>
        ))}
      </div>
      <div className="mt-1 grid aspect-square grid-cols-5 gap-1">
        {Array.from({ length: 25 }, (_, i) => {
          // Render row by row: i = row * 5 + col; cells are indexed col * 5 + row.
          const r = Math.floor(i / 5);
          const c = i % 5;
          const n = card.grid[c][r];
          const free = isFree(c, r);
          const isMarked = free || marked.has(n);
          const highlighted = hl.has(c * 5 + r);
          const ring = !!called && !free && !isMarked && called.has(n);
          if (free) {
            return (
              <div
                key={i}
                className={cx(
                  'relative flex flex-col items-center justify-center rounded-md border-[1.5px] border-burgundy font-display text-burgundy',
                  highlighted ? 'bg-gold-light shadow-[0_0_8px_rgba(201,162,39,.8)]' : 'bg-gold',
                )}
              >
                <Icon.Star className="size-3.5" />
                <span className="text-[clamp(8px,2.3vw,11px)] tracking-wider">FREE</span>
              </div>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={onCellTap ? () => onCellTap(c, r, n) : undefined}
              className={cx(
                'relative flex items-center justify-center rounded-md border font-display text-[clamp(13px,4.2vw,20px)] text-ink transition-all duration-300 select-none',
                onCellTap ? 'cursor-pointer active:scale-95' : 'cursor-default',
                highlighted
                  ? 'border-2 border-gold bg-gold-light shadow-[0_0_8px_rgba(201,162,39,.7)]'
                  : ring
                    ? 'border-2 border-burgundy/55 bg-parchment'
                    : 'border-parchment-dark bg-parchment',
              )}
            >
              <span>{n}</span>
              <motion.span
                className="absolute inset-[7%] flex items-center justify-center rounded-full border-[1.5px] border-gold-light bg-burgundy/92 font-display text-cream"
                initial={false}
                animate={isMarked ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={isMarked ? { type: 'spring', stiffness: 420, damping: 16 } : { duration: 0.18 }}
              >
                <span className="text-[clamp(12px,3.8vw,18px)]">{n}</span>
              </motion.span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
