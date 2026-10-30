'use client';

import { AnimatePresence, motion } from 'motion/react';

import { letterFor } from '@/lib/game/card';

export const BALL_COLORS: Record<string, string> = {
  B: '#1e4d8c',
  I: '#b3261e',
  N: '#f4f1e8',
  G: '#2e7d4f',
  O: '#e0a526',
};

export function onLetter(letter: string): string {
  return letter === 'N' || letter === 'O' ? '#2b1d14' : '#ffffff';
}

function mix(hex: string, towards: 'white' | 'black', t: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const target = towards === 'white' ? 255 : 0;
  const f = (c: number) => Math.round(c + (target - c) * t);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** A glossy bingo ball with its letter and number. */
export function Ball({ number, size = 72, dim = false, className }: { number: number; size?: number; dim?: boolean; className?: string }) {
  const letter = letterFor(number);
  const color = BALL_COLORS[letter];
  const letterColor = letter === 'N' ? '#2b1d14' : color;
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        opacity: dim ? 0.45 : 1,
        background: `radial-gradient(circle at 32% 30%, ${mix(color, 'white', 0.45)} 0%, ${color} 55%, ${mix(color, 'black', 0.35)} 100%)`,
        boxShadow: `0 ${size * 0.06}px ${size * 0.12}px rgba(0,0,0,.35)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size * 0.66,
          height: size * 0.66,
          borderRadius: '50%',
          background: '#fff8e7',
          border: '1px solid rgba(0,0,0,.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
        className="font-display"
      >
        <span style={{ fontSize: size * 0.17, color: letterColor }}>{letter}</span>
        <span style={{ fontSize: size * 0.3, color: '#2b1d14', marginTop: size * 0.01 }}>{number}</span>
      </div>
    </div>
  );
}

/** Placeholder shown before the first ball is drawn. */
export function EmptyBall({ size = 72, label = '?' }: { size?: number; label?: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-full border-2 border-gold bg-parchment-dark/60 font-display text-ink-soft"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {label}
    </div>
  );
}

/** Shows the latest ball and pops it in with an elastic bounce when it changes. */
export function CurrentBall({ number, size = 150 }: { number: number | null; size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="relative">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={number ?? 'empty'}
          className="absolute inset-0"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        >
          {number == null ? <EmptyBall size={size} /> : <Ball number={number} size={size} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
