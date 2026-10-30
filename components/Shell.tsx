'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { GoldRule, Icon, cx } from './ui';

/**
 * Page frame: burgundy bar with a gold rule, parchment page, content kept to
 * a phone-friendly column (or a wide two-column area on large screens).
 */
export function Shell({
  title,
  subtitle,
  onBack,
  backHref = '/',
  hideBack,
  actions,
  children,
  wide,
  bottom,
  fab,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  backHref?: string;
  hideBack?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  bottom?: ReactNode;
  fab?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-burgundy text-cream shadow-md shadow-burgundy-dark/40 pt-[env(safe-area-inset-top)]">
        <div className={cx('mx-auto flex h-14 w-full items-center gap-1 px-2', wide ? 'max-w-6xl' : 'max-w-[600px]')}>
          {!hideBack && (
            <button
              aria-label="Back"
              onClick={() => (onBack ? onBack() : router.push(backHref))}
              className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-cream/10 active:bg-cream/15"
            >
              <Icon.Back />
            </button>
          )}
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate font-display text-[19px] leading-tight tracking-wide">{title}</div>
            {subtitle && <div className="truncate text-[12px] italic leading-tight text-gold-light">{subtitle}</div>}
          </div>
          <div className="flex min-w-11 items-center justify-end gap-0.5">{actions}</div>
        </div>
        <GoldRule />
      </header>
      <main className={cx('mx-auto w-full flex-1 px-4 pb-6 pt-4', wide ? 'max-w-6xl' : 'max-w-[600px]', fab ? 'pb-28' : undefined)}>
        {children}
      </main>
      {fab && <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-30">{fab}</div>}
      {bottom && (
        <div className="sticky bottom-0 z-30 border-t-[3px] border-gold bg-burgundy text-cream pb-[env(safe-area-inset-bottom)]">
          <div className={cx('mx-auto w-full px-4 py-2.5', wide ? 'max-w-6xl' : 'max-w-[600px]')}>{bottom}</div>
        </div>
      )}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-cream/10 active:bg-cream/15 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
