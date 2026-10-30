'use client';

import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button, Icon, TextField, cx } from './ui';

// ------------------------------------------------------------------ dialogs

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: ReactNode;
}

export interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  confirmLabel?: string;
  maxLength?: number;
  validator?: (value: string) => string | null;
  message?: ReactNode;
}

export interface SheetOption {
  key: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  tone?: 'gold' | 'burgundy' | 'parchment' | 'danger';
}

export interface SheetOptions {
  title: string;
  subtitle?: string;
  options: SheetOption[];
  cancelLabel?: string;
}

export interface ChoiceOptions {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  choices: Array<{ key: string; label: string; variant?: 'primary' | 'outline' | 'danger' | 'gold'; icon?: ReactNode }>;
  cancelLabel?: string;
}

interface DialogApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  prompt: (o: PromptOptions) => Promise<string | null>;
  info: (o: { title: string; message: ReactNode; icon?: ReactNode; buttonLabel?: string }) => Promise<void>;
  sheet: (o: SheetOptions) => Promise<string | null>;
  choice: (o: ChoiceOptions) => Promise<string | null>;
  custom: <T>(render: (close: (value: T | null) => void) => ReactNode, opts?: { sheet?: boolean }) => Promise<T | null>;
  closeAll: () => void;
}

type Entry = { id: number; sheet: boolean; render: (close: (v: unknown) => void) => ReactNode; close: (v: unknown) => void };

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs outside AppProviders');
  return ctx;
}

function DialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([]);
  const seq = useRef(0);

  const open = useCallback(<T,>(render: (close: (v: T | null) => void) => ReactNode, sheet = false) => {
    return new Promise<T | null>((resolve) => {
      const id = ++seq.current;
      const close = (v: unknown) => {
        setStack((s) => s.filter((e) => e.id !== id));
        resolve((v as T) ?? null);
      };
      setStack((s) => [...s, { id, sheet, render: render as Entry['render'], close }]);
    });
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      custom: (render, opts) => open(render, opts?.sheet),
      closeAll: () => setStack((s) => (s.forEach((e) => e.close(null)), [])),
      confirm: (o) =>
        open<boolean>((close) => (
          <DialogFrame icon={o.icon ?? (o.danger ? <WarningIcon /> : <QuestionIcon />)} danger={o.danger} title={o.title}>
            <p className="text-center text-[16px] text-ink">{o.message}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => close(false)}>
                {o.cancelLabel ?? 'Cancel'}
              </Button>
              <Button variant={o.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {o.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </DialogFrame>
        )).then((v) => v === true),
      info: (o) =>
        open<boolean>((close) => (
          <DialogFrame icon={o.icon ?? <Icon.Info className="size-9 text-gold" />} title={o.title}>
            <p className="whitespace-pre-line text-center text-[16px] text-ink">{o.message}</p>
            <div className="mt-5 flex justify-center">
              <Button onClick={() => close(true)} autoFocus>
                {o.buttonLabel ?? 'OK'}
              </Button>
            </div>
          </DialogFrame>
        )).then(() => undefined),
      prompt: (o) => open<string>((close) => <PromptDialog o={o} close={close} />),
      sheet: (o) => open<string>((close) => <SheetDialog o={o} close={close} />, true),
      choice: (o) =>
        open<string>((close) => (
          <DialogFrame icon={o.icon ?? <Icon.Door className="size-9 text-gold" />} title={o.title}>
            {o.message && <p className="text-center text-[16px] text-ink">{o.message}</p>}
            <div className="mt-5 flex flex-col gap-2.5">
              {o.choices.map((c) => (
                <Button key={c.key} variant={c.variant ?? 'outline'} icon={c.icon} full onClick={() => close(c.key)}>
                  {c.label}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => close(null)}>
                {o.cancelLabel ?? 'Cancel'}
              </Button>
            </div>
          </DialogFrame>
        )),
    }),
    [open],
  );

  // Escape closes the top-most dialog.
  useEffect(() => {
    if (!stack.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stack[stack.length - 1].close(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stack]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {stack.map((e) => (
          <motion.div
            key={e.id}
            className={cx('fixed inset-0 z-50 flex', e.sheet ? 'items-end justify-center' : 'items-center justify-center p-5')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]" onClick={() => e.close(null)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              className={cx(
                'relative w-full border-[1.5px] border-gold bg-cream shadow-2xl',
                e.sheet ? 'max-w-xl rounded-t-3xl pb-[max(env(safe-area-inset-bottom),10px)]' : 'max-w-md rounded-2xl p-6',
              )}
              initial={e.sheet ? { y: 60, opacity: 0 } : { scale: 0.92, y: 12, opacity: 0 }}
              animate={e.sheet ? { y: 0, opacity: 1 } : { scale: 1, y: 0, opacity: 1 }}
              exit={e.sheet ? { y: 60, opacity: 0 } : { scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              {e.render(e.close)}
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>
    </DialogContext.Provider>
  );
}

function DialogFrame({ icon, title, danger, children }: { icon?: ReactNode; title: string; danger?: boolean; children: ReactNode }) {
  return (
    <div>
      {icon && <div className={cx('mx-auto mb-2 flex justify-center', danger ? 'text-danger' : 'text-gold')}>{icon}</div>}
      <h2 className="text-center font-display text-[20px] text-burgundy">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 21h20L12 3ZM12 10v5M12 18h.01" />
    </svg>
  );
}

function PromptDialog({ o, close }: { o: PromptOptions; close: (v: string | null) => void }) {
  const [value, setValue] = useState(o.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const err = o.validator?.(value) ?? null;
    if (err) {
      setError(err);
      return;
    }
    close(value.trim());
  };
  return (
    <DialogFrame title={o.title}>
      {o.message && <p className="mb-3 text-center text-[15px] text-ink-soft">{o.message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label={o.label}
          value={value}
          autoFocus
          maxLength={o.maxLength}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          error={error}
        />
        {o.maxLength && <div className="mt-1 text-right text-[12px] text-ink-soft">{value.length}/{o.maxLength}</div>}
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" variant="ghost" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button type="submit">{o.confirmLabel ?? 'Save'}</Button>
        </div>
      </form>
    </DialogFrame>
  );
}

function SheetDialog({ o, close }: { o: SheetOptions; close: (v: string | null) => void }) {
  const tones = {
    gold: 'bg-gold text-ink',
    burgundy: 'bg-burgundy text-cream',
    parchment: 'bg-parchment-dark text-burgundy',
    danger: 'bg-danger text-cream',
  };
  return (
    <div className="px-2 pt-3">
      <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-gold" />
      <h2 className="text-center font-display text-[18px] text-burgundy">{o.title}</h2>
      {o.subtitle && <p className="mt-1 text-center text-[14px] text-ink-soft">{o.subtitle}</p>}
      <div className="mt-2 flex flex-col">
        {o.options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => close(opt.key)}
            className="flex items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors hover:bg-burgundy/6 active:bg-burgundy/10"
          >
            <span className={cx('flex size-11 shrink-0 items-center justify-center rounded-full', tones[opt.tone ?? 'gold'])}>{opt.icon}</span>
            <span className="min-w-0">
              <span className="block text-[16px] font-bold text-ink">{opt.label}</span>
              {opt.description && <span className="block text-[13.5px] text-ink-soft">{opt.description}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-center">
        <Button variant="ghost" onClick={() => close(null)}>
          {o.cancelLabel ?? 'Cancel'}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- toasts

interface Toast {
  id: number;
  message: string;
  icon?: ReactNode;
  tone?: 'ink' | 'danger' | 'success';
}

const ToastContext = createContext<((message: string, opts?: { icon?: ReactNode; tone?: Toast['tone']; duration?: number }) => void) | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside AppProviders');
  return ctx;
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((message: string, opts?: { icon?: ReactNode; tone?: Toast['tone']; duration?: number }) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message, icon: opts?.icon, tone: opts?.tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.duration ?? 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),14px)] z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className={cx(
                'pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-xl border border-gold px-3.5 py-3 text-[15px] text-cream shadow-xl',
                t.tone === 'danger' ? 'bg-danger' : t.tone === 'success' ? 'bg-felt' : 'bg-ink',
              )}
            >
              <span className="text-gold-light [&>svg]:size-5">{t.icon ?? <Icon.Celebrate />}</span>
              <span className="flex-1">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DialogProvider>{children}</DialogProvider>
    </ToastProvider>
  );
}
