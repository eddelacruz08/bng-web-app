'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Cream panel with a gold border, for grouping content. */
export function Panel({
  children,
  className,
  tone = 'cream',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'cream' | 'gold' | 'danger';
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border-[1.5px] border-gold shadow-panel',
        tone === 'cream' && 'bg-cream',
        tone === 'gold' && 'bg-gold-light/40',
        tone === 'danger' && 'bg-danger/8',
        className ?? 'p-4',
      )}
    >
      {children}
    </div>
  );
}

export function GoldRule({ className }: { className?: string }) {
  return <div className={cx('h-[3px] w-full bg-linear-to-r from-gold via-gold-light to-gold', className)} />;
}

type Variant = 'primary' | 'gold' | 'outline' | 'outlineLight' | 'danger' | 'ghost' | 'felt';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; full?: boolean; icon?: ReactNode }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl border-[1.5px] font-display tracking-wide transition-all duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 select-none';
  const variants: Record<Variant, string> = {
    primary: 'bg-burgundy text-cream border-gold shadow-md shadow-burgundy-dark/40 hover:bg-burgundy-dark',
    gold: 'bg-gold text-ink border-gold-light shadow-md shadow-ink/25 hover:bg-gold-light',
    felt: 'bg-felt text-cream border-gold hover:bg-felt-dark',
    outline: 'bg-transparent text-burgundy border-burgundy hover:bg-burgundy/8',
    outlineLight: 'bg-transparent text-cream border-gold-light hover:bg-cream/10',
    danger: 'bg-danger text-cream border-danger hover:brightness-95',
    ghost: 'bg-transparent text-burgundy border-transparent font-body font-bold tracking-normal hover:bg-burgundy/8',
  };
  const sizes: Record<Size, string> = {
    sm: 'h-9 px-3 text-[13px]',
    md: 'h-12 px-5 text-[15px]',
    lg: 'h-14 px-6 text-[17px]',
    xl: 'h-[60px] px-6 text-[20px] tracking-wider',
  };
  return (
    <button className={cx(base, variants[variant], sizes[size], full && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function Chip({
  children,
  color = 'burgundy',
  icon,
  className,
}: {
  children: ReactNode;
  color?: 'burgundy' | 'gold' | 'felt' | 'ink' | 'blue' | 'success' | 'danger' | 'cream';
  icon?: ReactNode;
  className?: string;
}) {
  const colors = {
    burgundy: 'text-burgundy border-burgundy bg-burgundy/10',
    gold: 'text-[#8a6d12] border-gold bg-gold/15',
    felt: 'text-felt border-felt bg-felt/10',
    ink: 'text-ink-soft border-ink-soft bg-ink-soft/10',
    blue: 'text-ball-b border-ball-b bg-ball-b/10',
    success: 'text-success border-success bg-success/10',
    danger: 'text-danger border-danger bg-danger/10',
    cream: 'text-cream border-cream bg-cream/15',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-bold leading-none',
        colors[color],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** "— ◆ TITLE ◆ —" style heading. */
export function SectionTitle({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-px flex-1 bg-gold" />
      <div className={cx('flex items-center gap-2 font-display text-[13.5px] tracking-[.12em] uppercase', light ? 'text-cream' : 'text-burgundy')}>
        <Diamond />
        {children}
        <Diamond />
      </div>
      <div className="h-px flex-1 bg-gold" />
    </div>
  );
}

function Diamond() {
  return <span className="inline-block size-[9px] rotate-45 rounded-[1px] bg-gold" />;
}

export function Avatar({ name, color, size = 40 }: { name: string; color?: string; size?: number }) {
  const initials =
    name.trim() === ''
      ? '?'
      : name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() ?? '')
          .join('');
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-gold font-display text-cream"
      style={{ width: size, height: size, background: color ?? '#7a1e2b', fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="text-gold [&>svg]:size-16">{icon}</div>
      <h2 className="mt-3 font-display text-xl text-burgundy">{title}</h2>
      <p className="mt-2 max-w-sm text-[15px] text-ink-soft">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 22, light }: { size?: number; light?: boolean }) {
  return (
    <span
      className={cx('inline-block animate-spin rounded-full border-[2.5px] border-t-transparent', light ? 'border-gold-light border-t-transparent' : 'border-gold border-t-transparent')}
      style={{ width: size, height: size }}
      aria-label="loading"
    />
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-burgundy border-gold' : 'bg-parchment-dark border-ink-soft/40',
      )}
    >
      <span
        className={cx(
          'absolute left-0.5 size-6 rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-5 bg-gold' : 'translate-x-0 bg-ink-soft',
        )}
      />
    </button>
  );
}

export function TextField({
  label,
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-[13px] font-bold text-ink-soft">{label}</span>}
      <input
        className={cx(
          'h-12 w-full rounded-xl border bg-cream px-3.5 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-soft/60',
          error ? 'border-danger' : 'border-gold focus:border-burgundy focus:ring-2 focus:ring-burgundy/20',
        )}
        {...rest}
      />
      {error && <span className="mt-1 block text-[13px] text-danger">{error}</span>}
    </label>
  );
}

/** Icons (inline SVG, 24px grid) so the app needs no icon font. */
export const Icon = {
  Back: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  Mic: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
    </svg>
  ),
  Wifi: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M12 20.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM2 8.82A14.9 14.9 0 0 1 12 5c3.79 0 7.26 1.43 10 3.82l-1.6 1.74A12.5 12.5 0 0 0 12 7.4c-3.17 0-6.08 1.19-8.4 3.16L2 8.82Zm3.35 3.63A9.6 9.6 0 0 1 12 10.2c2.52 0 4.83.95 6.65 2.25l-1.65 1.79A7.2 7.2 0 0 0 12 12.6c-1.88 0-3.6.7-5 1.64l-1.65-1.79Z" />
    </svg>
  ),
  Casino: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2.5 3A1.5 1.5 0 1 0 7.5 9a1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  ),
  Grid: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M4 4h4v4H4V4Zm6 0h4v4h-4V4Zm6 0h4v4h-4V4ZM4 10h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM4 16h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4Z" />
    </svg>
  ),
  History: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" />
    </svg>
  ),
  People: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05A4.2 4.2 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z" />
    </svg>
  ),
  Trophy: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.35 12H8a4 4 0 0 1-4-4V5h3V3Zm11 4h-1v3a2 2 0 0 0 1-1.73V7ZM6 7v1.27A2 2 0 0 0 7 10V7H6Z" />
    </svg>
  ),
  Play: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  ),
  Stop: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Save: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M5 4h11l3 3v13H5V4Z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
    </svg>
  ),
  Close: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  Plus: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Undo: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  ),
  Next: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12Zm10-12v12h2V6h-2Z" />
    </svg>
  ),
  More: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  ),
  Info: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  Check: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>
  ),
  Celebrate: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M2 22 8 7l9 9-15 6Zm12.5-12.5 5-5 1.5 1.5-5 5-1.5-1.5ZM13 3h2v3h-2V3Zm6 7h3v2h-3v-2Zm-1.1-6.2 1.4 1.4-2 2-1.4-1.4 2-2Z" />
    </svg>
  ),
  Hourglass: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M6 3h12M6 21h12M8 3v4l4 5 4-5V3M8 21v-4l4-5 4 5v4" />
    </svg>
  ),
  Pause: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
    </svg>
  ),
  Card: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  Copy: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5h10" />
    </svg>
  ),
  Edit: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="m4 20 4-1L19 8l-3-3L5 16l-1 4Z" />
    </svg>
  ),
  Trash: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  ),
  Flag: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="M5 3h2v18H5V3Zm3 1h11l-2.5 4L19 12H8V4Z" />
    </svg>
  ),
  Paper: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v4h4M9 12h6M9 16h6" />
    </svg>
  ),
  Door: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4h10v16H10M4 12h10m-3-3 3 3-3 3" />
    </svg>
  ),
  Refresh: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
    </svg>
  ),
  Carousel: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="7" y="5" width="10" height="14" rx="1.5" />
      <path d="M3 8v8M21 8v8" />
    </svg>
  ),
  Star: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="currentColor">
      <path d="m12 2 2.9 6.6 7.1.7-5.4 4.8 1.6 7L12 17.5 5.8 21l1.6-7L2 9.3l7.1-.7L12 2Z" />
    </svg>
  ),
  Router: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 16.5h.01M11 16.5h.01M17 10V4M14 7l3-3 3 3" />
    </svg>
  ),
  Link: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={cx('size-6', p.className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </svg>
  ),
};
