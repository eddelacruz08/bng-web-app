'use client';

import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { useDialogs, useToast } from '@/components/Providers';
import { Avatar, Button, Icon, Panel, cx } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { api } from '@/lib/client/api';
import { useAppState } from '@/lib/client/app-state';
import { formatShortDate } from '@/lib/client/format';
import { getClientId } from '@/lib/client/identity';
import { useProfileGate } from '@/lib/client/use-profile-gate';
import type { GameSession } from '@/lib/game/types';

interface MenuItem {
  icon: ReactNode;
  label: string;
  caption: string;
  onTap: () => void;
}

export default function HomePage() {
  const router = useRouter();
  const app = useAppState();
  const dialogs = useDialogs();
  const toast = useToast();
  const ensureProfile = useProfileGate(app, dialogs);
  const [pending, setPending] = useState<GameSession | null>(null);
  const [open, setOpen] = useState<{ host: GameSession | null; caller: GameSession | null }>({ host: null, caller: null });

  const refresh = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([
        api.get<{ sessions: GameSession[] }>('/api/sessions'),
        api.get<{ host: GameSession | null; caller: GameSession | null }>('/api/status'),
      ]);
      setOpen(st);
      const mine = getClientId();
      const openIds = new Set([st.host?.id, st.caller?.id].filter(Boolean));
      setPending(
        s.sessions.find(
          (x) =>
            x.status !== 'finished' &&
            !openIds.has(x.id) &&
            (x.role === 'host' || x.role === 'caller' || (x.role === 'player' && x.ownerClientId === mine)),
        ) ?? null,
      );
    } catch {
      /* server not reachable yet; the page still renders */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const q = new URLSearchParams(window.location.search);
    const result = q.get('result');
    if (result === 'saved') toast('Session saved. Resume it any time from History.', { icon: <Icon.Save /> });
    if (result === 'ended') toast('Session finished and stored in History.', { icon: <Icon.Flag /> });
    if (result) window.history.replaceState(null, '', '/');
  }, [refresh, toast]);

  const host = async () => {
    const me = await ensureProfile();
    if (!me) return;
    const name = await dialogs.prompt({
      title: 'Name your bingo hall',
      label: 'Lobby name',
      initial: `${me.name}'s Bingo Hall`,
      confirmLabel: 'Open Lobby',
      maxLength: 30,
      validator: (v) => (v.trim() ? null : 'Give the lobby a name.'),
    });
    if (!name) return;
    router.push(`/host?open=1&name=${encodeURIComponent(name)}`);
  };

  const join = async () => {
    if (!(await ensureProfile())) return;
    router.push('/join');
  };

  const caller = async () => {
    const name = await dialogs.prompt({
      title: 'Name this caller session',
      label: 'Session name',
      initial: `Ball Caller · ${formatShortDate()}`,
      confirmLabel: 'Open the Desk',
      maxLength: 30,
      validator: (v) => (v.trim() ? null : 'Give the session a name.'),
    });
    if (!name) return;
    router.push(`/caller?open=1&name=${encodeURIComponent(name)}`);
  };

  const resume = (s: GameSession) => {
    if (s.role === 'player') router.push(`/play?rejoin=${encodeURIComponent(s.id)}`);
    else router.push(`/${s.role}?resume=${encodeURIComponent(s.id)}`);
  };

  const dismissPending = async (s: GameSession) => {
    const ok = await dialogs.confirm({
      title: 'Forget this session?',
      message: 'It stays in History as finished, but will no longer be offered for reconnect.',
      confirmLabel: 'Forget',
      danger: true,
    });
    if (!ok) return;
    await api.put(`/api/sessions/${s.id}`, { finish: true });
    void refresh();
  };

  const items: MenuItem[] = [
    { icon: <Icon.Mic />, label: 'Host a Game', caption: 'Open a lobby here and call the numbers', onTap: host },
    { icon: <Icon.Wifi />, label: 'Join a Game', caption: 'Find a lobby on this network', onTap: join },
    { icon: <Icon.Casino />, label: 'Ball Caller', caption: 'Draw the balls for paper cards, no players needed', onTap: caller },
    { icon: <Icon.Grid />, label: 'My Cards', caption: 'Random cards, dealt to you in every game', onTap: () => router.push('/cards') },
    { icon: <Icon.History />, label: 'History', caption: 'Past sessions, resume saved games', onTap: () => router.push('/history') },
    { icon: <Icon.People />, label: 'Players & Settings', caption: 'Profiles, auto-call, auto-daub', onTap: () => router.push('/settings') },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[600px] flex-col px-5 pb-8 pt-[max(env(safe-area-inset-top),24px)]">
      <Wordmark />
      <div className="mt-5">
        <ProfileBanner
          name={app.active?.name ?? null}
          color={app.active?.color}
          onTap={async () => {
            if (await ensureProfile()) router.push('/settings');
          }}
        />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {open.host && <OpenBanner icon={<Icon.Mic />} title="A lobby is open on this server" line={`${open.host.name} · Room ${open.host.code}`} cta="Open the caller's desk" onTap={() => router.push('/host')} />}
        {open.caller && <OpenBanner icon={<Icon.Casino />} title="The Ball Caller is open" line={open.caller.name} cta="Back to the desk" onTap={() => router.push('/caller')} />}
        {pending && <ReconnectBanner session={pending} onResume={() => resume(pending)} onDismiss={() => dismissPending(pending)} />}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item, i) => (
          <motion.button
            key={item.label}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            onClick={item.onTap}
            className="text-left"
          >
            <Panel className="flex items-center gap-3.5 px-3.5 py-3 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.99]">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-burgundy text-cream">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[17px] text-burgundy">{item.label}</span>
                <span className="block text-[13.5px] text-ink-soft">{item.caption}</span>
              </span>
              <svg viewBox="0 0 24 24" className="size-6 text-gold" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Panel>
          </motion.button>
        ))}
      </div>
      <p className="mt-6 text-center text-[13px] italic text-ink-soft">Numbers 1 to 75 · Same network as the phones · No internet needed</p>
    </main>
  );
}

function ProfileBanner({ name, color, onTap }: { name: string | null; color?: string; onTap: () => void }) {
  return (
    <button onClick={onTap} className="flex w-full items-center gap-2.5 rounded-full border-[1.5px] border-gold bg-burgundy py-1.5 pl-1.5 pr-4 text-left text-cream transition-colors hover:bg-burgundy-dark">
      <Avatar name={name ?? '?'} color={name ? color : '#6b5544'} size={38} />
      <span className="flex-1 truncate text-[15px] font-bold">{name ? `Playing as ${name}` : 'Tap to set your player name'}</span>
      <Icon.Edit className="size-[18px] text-gold-light" />
    </button>
  );
}

function OpenBanner({ icon, title, line, cta, onTap }: { icon: ReactNode; title: string; line: string; cta: string; onTap: () => void }) {
  return (
    <Panel tone="gold" className="flex items-center gap-3 py-3 pl-3.5 pr-3">
      <span className="text-burgundy [&>svg]:size-8">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] text-burgundy">{title}</span>
        <span className="block truncate text-[13.5px] text-ink-soft">{line}</span>
      </span>
      <Button size="sm" onClick={onTap} icon={<Icon.Play className="size-4" />}>
        {cta}
      </Button>
    </Panel>
  );
}

/** Offers to reopen the latest session that did not finish (crash, lost network, Stop & Save). */
function ReconnectBanner({ session: s, onResume, onDismiss }: { session: GameSession; onResume: () => void; onDismiss: () => void }) {
  const [title, icon] =
    s.role === 'host'
      ? ['Reconnect as host', <Icon.Mic key="i" />]
      : s.role === 'caller'
        ? ['Continue calling', <Icon.Casino key="i" />]
        : ['Rejoin as player', <Icon.People key="i" />];
  const status = s.status === 'paused' ? 'paused' : s.status === 'playing' ? 'was in play' : 'lobby open';
  return (
    <Panel tone="gold" className={cx('flex items-start gap-3 py-3 pl-3.5 pr-1.5')}>
      <span className="mt-1 text-burgundy [&>svg]:size-8">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] text-burgundy">{title}</span>
        <span className="block text-[13.5px] text-ink-soft">
          {s.name} · {status}
        </span>
        <Button size="sm" className="mt-2" onClick={onResume} icon={<Icon.Play className="size-4" />}>
          Resume
        </Button>
      </span>
      <button aria-label="Forget" onClick={onDismiss} className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-ink/8">
        <Icon.Close className="size-5" />
      </button>
    </Panel>
  );
}
