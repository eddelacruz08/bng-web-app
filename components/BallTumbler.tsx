'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { Ball, EmptyBall } from './Ball';

/**
 * The caller's ball: while [tumbling] it rattles around the cage showing
 * random numbers, then settles on [number] with a spin-down and a pop.
 */
export function BallTumbler({ number, tumbling, size = 150 }: { number: number | null; tumbling: boolean; size?: number }) {
  const cage = size * 1.32;
  const [shown, setShown] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!tumbling) return;
    timer.current = setInterval(() => {
      const r = size * 0.16;
      setShown(1 + Math.floor(Math.random() * 75));
      setOffset({ x: (Math.random() * 2 - 1) * r, y: (Math.random() * 2 - 1) * r });
    }, 55);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [tumbling, size]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: cage, height: cage }}>
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0"
        animate={tumbling ? { rotate: 360 } : { rotate: 0 }}
        transition={tumbling ? { repeat: Infinity, ease: 'linear', duration: 0.9 } : { duration: 0.4 }}
      >
        <circle cx="50" cy="50" r="47" fill="none" stroke="#c9a227" strokeWidth={tumbling ? 3 : 1.8} opacity={tumbling ? 1 : 0.55} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          const x1 = 50 + Math.cos(a) * 40;
          const y1 = 50 + Math.sin(a) * 40;
          const x2 = 50 + Math.cos(a) * 47;
          const y2 = 50 + Math.sin(a) * 47;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9a227" strokeWidth="1.2" opacity={tumbling ? 0.7 : 0.3} />;
        })}
      </motion.svg>
      {tumbling ? (
        <motion.div
          style={{ x: offset.x, y: offset.y }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, ease: 'linear', duration: 0.42 }}
        >
          <Ball number={shown} size={size * 0.8} />
        </motion.div>
      ) : number == null ? (
        <EmptyBall size={size} />
      ) : (
        <motion.div
          key={number}
          initial={{ rotate: -720, scale: 0.7 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ rotate: { duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }, scale: { type: 'spring', stiffness: 220, damping: 12, delay: 0.15 } }}
        >
          <Ball number={number} size={size} />
        </motion.div>
      )}
    </div>
  );
}
