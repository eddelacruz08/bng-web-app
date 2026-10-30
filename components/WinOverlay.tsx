'use client';

import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { PATTERNS } from '@/lib/game/pattern';
import { isPaperWinner, winnerNames, type WinnerInfo } from '@/lib/game/types';
import { BingoCardView } from './BingoCardView';
import { PatternPreview } from './Pattern';
import { Button, Chip, Icon, Panel } from './ui';

const COLORS = ['#c9a227', '#e8cc66', '#fff8e7', '#1e4d8c', '#2e7d4f', '#e0a526'];

function burst() {
  const base = { spread: 90, startVelocity: 38, ticks: 220, gravity: 0.9, colors: COLORS, zIndex: 80 };
  confetti({ ...base, particleCount: 70, origin: { x: 0.5, y: 0.25 } });
  setTimeout(() => confetti({ ...base, particleCount: 40, angle: 60, origin: { x: 0.1, y: 0.4 } }), 180);
  setTimeout(() => confetti({ ...base, particleCount: 40, angle: 120, origin: { x: 0.9, y: 0.4 } }), 360);
}

/**
 * Celebration screen for the host and every player. New co-winners pop in
 * (with another burst) while it stays open.
 */
export function WinOverlay({
  winners,
  viewerIsHost,
  playerName = '',
  checkedBy = 'the host',
  onClose,
}: {
  winners: WinnerInfo[];
  viewerIsHost: boolean;
  playerName?: string;
  /** Who verified paper cards: "the host" in a lobby, "the caller" on the Ball Caller desk. */
  checkedBy?: string;
  onClose: () => void;
}) {
  const seen = useRef(0);
  useEffect(() => {
    if (winners.length > seen.current) {
      seen.current = winners.length;
      burst();
    }
  }, [winners.length]);

  const first = winners[0] ?? null;
  const isMe = (w: WinnerInfo) => w.isMe || w.playerName.toLowerCase() === playerName.toLowerCase();
  const me = winners.filter(isMe);
  const names = winnerNames(winners);
  const roundNo = first?.roundNumber ?? 0;
  const label = first ? PATTERNS[first.pattern].label : '';
  const headline =
    winners.length === 0
      ? 'Round over'
      : viewerIsHost
        ? `${names} win${winners.length === 1 ? 's' : ''} round ${roundNo}!`
        : me.length
          ? winners.length === 1
            ? `You win round ${roundNo}!`
            : `You win round ${roundNo}, with ${winnerNames(winners.filter((w) => !isMe(w)))}!`
          : `${names} win${winners.length === 1 ? 's' : ''} round ${roundNo}`;
  const sub = !first
    ? ''
    : winners.length === 1
      ? viewerIsHost
        ? isPaperWinner(first)
          ? `Recorded: ${label} on a paper card after ${first.calledCount} calls.`
          : `Verified: ${label} on "${first.cardName}" after ${first.calledCount} calls.`
        : me.length
          ? `The host verified your ${label} after ${first.calledCount} calls.`
          : `Better luck next round. ${label} after ${first.calledCount} calls.`
      : `${winners.length} cards completed ${label} on the same ball, after ${first.calledCount} calls.`;

  return (
    <motion.div
      className="fixed inset-0 z-[70] overflow-y-auto bg-[radial-gradient(120%_90%_at_50%_20%,#7a1e2b_0%,#55121d_100%)] text-cream"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.34, 1.3, 0.64, 1] }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center px-6 py-8 pb-[max(env(safe-area-inset-bottom),32px)]">
        <motion.div
          initial={{ scale: 0.2, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 11, delay: 0.1 }}
          className="font-wordmark text-[64px] leading-none text-gold-light [text-shadow:0_6px_12px_rgba(0,0,0,.5)]"
        >
          BINGO!
        </motion.div>
        <h1 className="mt-2 text-center font-display text-[24px] leading-tight">{headline}</h1>
        <p className="mt-2 text-center text-[15px] italic text-parchment">{sub}</p>
        {first && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <PatternPreview pattern={first.pattern} size={40} color="#e8cc66" altColor="#fff8e7" />
            <Chip color="gold" icon={<Icon.Trophy className="size-3.5" />} className="!text-gold-light !border-gold-light !bg-gold-light/15">
              {label}
            </Chip>
            {winners.length > 1 && (
              <Chip color="cream" icon={<Icon.People className="size-3.5" />}>
                {winners.length} winners
              </Chip>
            )}
          </div>
        )}
        <div className="mt-5 flex w-full flex-col gap-3.5">
          <AnimatePresence initial={false}>
            {winners.map((w) => (
              <motion.div
                key={`${w.playerName}-${w.cardName}`}
                initial={{ opacity: 0, y: 18, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                {isPaperWinner(w) ? (
                  <Panel className="flex items-center gap-3 p-4">
                    <Icon.Paper className="size-10 text-burgundy" />
                    <div>
                      <div className="font-display text-[18px] text-burgundy">{w.playerName}</div>
                      <div className="text-ink-soft">Paper card · checked by {checkedBy}</div>
                    </div>
                  </Panel>
                ) : (
                  <BingoCardView
                    card={{ grid: w.grid, marked: w.cells.map((i) => w.grid[Math.floor(i / 5)][i % 5]) }}
                    highlight={w.cells}
                    title={isMe(w) ? `${w.playerName} (you) · ${w.cardName}` : `${w.playerName} · ${w.cardName}`}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <Button variant="gold" full size="lg" className="mt-6" onClick={onClose} icon={<Icon.Next className="size-5" />}>
          {viewerIsHost ? 'Back to the desk' : 'Back to the lobby'}
        </Button>
        {viewerIsHost && (
          <p className="mt-3 text-center text-[12.5px] italic text-parchment">
            Other cards that completed the pattern on this ball are still accepted until you start the next round.
          </p>
        )}
      </div>
    </motion.div>
  );
}
