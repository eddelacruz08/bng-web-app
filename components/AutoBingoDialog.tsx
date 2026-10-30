'use client';

import { motion } from 'motion/react';

import type { BingoCard } from '@/lib/game/card';
import { BingoCardView } from './BingoCardView';
import { Button, Icon, Spinner } from './ui';

export interface AutoBingoState {
  card: BingoCard;
  patternLabel: string;
  cells: number[];
  confirmed: null | { roundNumber: number; others: string[] };
}

/**
 * "BINGO! Card 1 completed Straight & Diagonal!" shown the moment a card
 * completes. It stays up through the host's check and shows the result.
 */
export function AutoBingoDialog({ state, onSeeWinners }: { state: AutoBingoState; onSeeWinners: () => void }) {
  const s = state.confirmed;
  return (
    <motion.div
      className="fixed inset-0 z-[65] flex items-center justify-center p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]" />
      <motion.div
        className="relative w-full max-w-sm overflow-y-auto rounded-2xl border-[1.5px] border-gold bg-burgundy p-5 text-cream shadow-2xl max-h-[92dvh]"
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <motion.div
          initial={{ scale: 0.3 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 11 }}
          className="text-center font-wordmark text-[52px] leading-none text-gold-light"
        >
          BINGO!
        </motion.div>
        <p className="mt-2 text-center font-display text-[19px] leading-snug">
          {s
            ? s.others.length === 0
              ? `You win round ${s.roundNumber}!`
              : `You win round ${s.roundNumber}, with ${s.others.join(', ')}!`
            : `${state.card.name} completed ${state.patternLabel}!`}
        </p>
        <div className="mx-auto mt-3.5 max-w-[300px]">
          <BingoCardView card={state.card} highlight={state.cells} title={state.card.name} compact />
        </div>
        {!s ? (
          <div className="mt-3.5 flex items-center justify-center gap-2.5 text-[15px] italic text-parchment">
            <Spinner size={18} light />
            <span>BINGO called for you. The host is checking your card...</span>
          </div>
        ) : (
          <>
            <p className="mt-3.5 text-center text-[15px] italic text-parchment">The host verified your card.</p>
            <Button variant="gold" full className="mt-3" onClick={onSeeWinners} icon={<Icon.Trophy className="size-5" />}>
              See the winners
            </Button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
