'use client';

import { motion } from 'motion/react';

import { BINGO_LETTERS } from '@/lib/game/card';
import { BALL_COLORS, onLetter } from './Ball';
import { GoldRule } from './ui';

export function Wordmark() {
  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-1.5">
        {BINGO_LETTERS.map((l, i) => (
          <motion.div
            key={l}
            initial={{ y: -18, opacity: 0, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.05 * i }}
            className="flex size-[34px] items-center justify-center rounded-full border-[1.5px] border-gold font-display text-[16px] shadow-md shadow-black/25"
            style={{ background: BALL_COLORS[l], color: onLetter(l) }}
          >
            {l}
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.2 }}
        className="mt-1.5 font-wordmark text-[58px] leading-[1.1] text-burgundy [text-shadow:2px_2px_0_#c9a227]"
      >
        BINGO
      </motion.div>
      <div className="font-body text-[16px] italic tracking-[.1em] text-ink-soft">Classic Hall Edition</div>
      <GoldRule className="mt-2 w-40 !h-[2px]" />
    </div>
  );
}
