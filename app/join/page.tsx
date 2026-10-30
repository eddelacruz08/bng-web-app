'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useDialogs, useToast } from '@/components/Providers';
import { Shell } from '@/components/Shell';
import { Button, Chip, Icon, Panel, SectionTitle, Spinner, TextField, cx } from '@/components/ui';
import { api } from '@/lib/client/api';
import { useAppState } from '@/lib/client/app-state';
import { hub, useLobbies } from '@/lib/client/hub';
import { useProfileGate } from '@/lib/client/use-profile-gate';
import type { BingoCard } from '@/lib/game/card';
import { GAME_PORT, isValidHost } from '@/lib/game/protocol';
import type { GameSession, LanAddress } from '@/lib/game/types';

interface ServerStatus {
  host: GameSession | null;
  hostPort: number | null;
  hostPlayers: number;
  publicUrl: string | null;
}

export default function JoinPage() {
  const router = useRouter();
  const app = useAppState();
  const dialogs = useDialogs();
  const toast = useToast();
  const ensureProfile = useProfileGate(app, dialogs);
  const { lobbies, error } = useLobbies();
  const [lan, setLan] = useState<LanAddress[] | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(String(GAME_PORT));
  const [formError, setFormError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [joining, setJoining] = useState(false);
  const [server, setServer] = useState<ServerStatus | null>(null);

  // A lobby hosted by this very server (the usual case when the app runs on
  // the internet, where UDP discovery cannot see anything).
  useEffect(() => {
    const load = () => api.get<ServerStatus>('/api/status').then(setServer).catch(() => {});
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    api
      .get<{ addresses: LanAddress[] }>('/api/lan')
      .then((r) => setLan(r.addresses))
      .catch(() => setLan([]));
    const q = new URLSearchParams(window.location.search);
    if (q.get('h')) setHost(q.get('h') ?? '');
    if (q.get('p')) setPort(q.get('p') ?? String(GAME_PORT));
    const t = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(t);
  }, []);

  /** Players need at least one card before they can join. */
  const ensureCards = async (owner: string): Promise<boolean> => {
    const r = await api.get<{ cards: BingoCard[] }>(`/api/cards?owner=${encodeURIComponent(owner)}`);
    if (r.cards.length > 0) return true;
    const ok = await dialogs.confirm({
      title: 'No cards yet',
      message: 'You need at least one card to play. Deal a random card now and keep it under "My Cards"?',
      confirmLabel: 'Deal a card & join',
      icon: <Icon.Card className="size-9 text-gold" />,
    });
    if (!ok) return false;
    await api.post('/api/cards', { owner, name: 'Card 1' });
    toast('Card 1 dealt with random numbers', { icon: <Icon.Casino /> });
    return true;
  };

  const join = async (h: string, p: number) => {
    if (joining) return;
    const me = await ensureProfile();
    if (!me) return;
    const name = me.name;
    setJoining(true);
    try {
      if (!(await ensureCards(name))) return;
      hub().send('player_join', { host: h, port: p, name, autoDaub: app.settings.autoDaub });
      router.push('/play');
    } finally {
      setJoining(false);
    }
  };

  const joinManual = (e: React.FormEvent) => {
    e.preventDefault();
    const h = host.trim();
    const p = Number.parseInt(port.trim(), 10);
    if (!isValidHost(h)) return setFormError('Enter an IPv4 address like 192.168.1.23, or a host name like bingo.fly.dev.');
    if (!Number.isInteger(p) || p < 1 || p > 65535) return setFormError('Port must be 1 to 65535.');
    setFormError(null);
    void join(h, p);
  };

  const mine = lan?.[0] ?? null;

  return (
    <Shell title="Join a Game" subtitle="Lobbies on your network">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[13.5px]">
          <Icon.Wifi className={cx('size-[18px]', mine ? 'text-success' : 'text-danger')} />
          <span className={mine ? 'text-ink-soft' : 'font-bold text-danger'}>
            {lan === null ? "Looking up this computer's network address..." : mine ? `This computer: ${mine.ip} on ${mine.iface}` : 'This computer has no local network address. Connect it to the WiFi or hotspot the host uses.'}
          </span>
        </div>

        {server?.host && server.hostPort && (
          <>
            <SectionTitle>On this server</SectionTitle>
            <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onClick={() => join('127.0.0.1', server.hostPort!)} className="text-left">
              <Panel tone="gold" className="flex items-center gap-3 px-3.5 py-3 transition-transform hover:-translate-y-0.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-burgundy text-cream">
                  <Icon.Mic />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold">{server.host.name}</span>
                  <span className="block text-[13px] text-ink-soft">
                    Host {server.host.hostName} · Room {server.host.code} · {server.hostPlayers} in lobby · hosted right here
                  </span>
                </span>
                <Chip color={server.host.status === 'playing' ? 'success' : 'gold'}>{server.host.status === 'playing' ? 'In play' : server.host.status === 'paused' ? 'Paused' : 'Open'}</Chip>
              </Panel>
            </motion.button>
          </>
        )}

        <SectionTitle>Lobbies found nearby</SectionTitle>
        {error ? (
          <Panel className="flex items-center gap-3 p-4">
            <Icon.Wifi className="size-6 text-danger" />
            <span>{error}</span>
          </Panel>
        ) : lobbies.length === 0 ? (
          <Panel className="p-4">
            <div className="flex items-center gap-3.5">
              <Spinner />
              <span className="text-ink-soft">Searching this network for lobbies...</span>
            </div>
            {slow && (
              <p className="mt-2.5 text-[13.5px] text-ink-soft">
                Not showing up? Check the host has &quot;Host a Game&quot; open and that this computer and the host are on the same WiFi. Then type the host&apos;s address below. If that also fails, this WiFi blocks devices from reaching each other: turn on the host phone&apos;s hotspot and connect this computer to it.
              </p>
            )}
          </Panel>
        ) : (
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {lobbies.map((l) => (
                <motion.button
                  key={`${l.host}:${l.port}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  onClick={() => join(l.host, l.port)}
                  className="text-left"
                >
                  <Panel className="flex items-center gap-3 px-3.5 py-3 transition-transform hover:-translate-y-0.5">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-felt text-cream">
                      <Icon.Router />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-bold">{l.name}</span>
                      <span className="block text-[13px] text-ink-soft">
                        Host {l.hostName} · Room {l.code} · {l.playerCount} in lobby
                      </span>
                      <span className="block text-[13px] text-ink-soft">
                        {l.host}:{l.port}
                      </span>
                    </span>
                    <Chip color={l.status === 'playing' ? 'success' : 'gold'}>{l.status === 'playing' ? 'In play' : l.status === 'paused' ? 'Paused' : 'Open'}</Chip>
                  </Panel>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}

        <SectionTitle>Or type the host address</SectionTitle>
        <Panel>
          <form onSubmit={joinManual} className="flex flex-col gap-3">
            <TextField label="Host address" placeholder="e.g. 192.168.1.23 or bingo.fly.dev" inputMode="url" autoCapitalize="none" value={host} onChange={(e) => setHost(e.target.value)} />
            <TextField label="Port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} error={formError} />
            <Button type="submit" full disabled={joining} icon={<Icon.Door className="size-5" />}>
              {joining ? 'Connecting...' : 'Connect'}
            </Button>
          </form>
        </Panel>

        <details className="rounded-xl px-2 py-1 text-ink-soft open:bg-cream/60">
          <summary className="cursor-pointer py-2 font-display text-[15px] text-burgundy">Having trouble?</summary>
          <ul className="list-disc space-y-1 pb-3 pl-5 text-[14px]">
            <li>The host screen (phone or browser) shows its IP address, port and a room code.</li>
            <li>This computer and the host must be on the same WiFi. Mobile data is not needed.</li>
            <li>Office, school, hotel and guest WiFi often block devices from reaching each other. If the lobby never appears or connecting times out, turn on the host phone&apos;s hotspot and connect this computer to it.</li>
            <li>Your saved cards from &quot;My Cards&quot; are dealt to you automatically; tap Add Card for more.</li>
            <li>If you join while a round is running you wait in the lobby and play from the next round.</li>
            <li>Hosting here and joining from this same browser works too: type this computer&apos;s own address.</li>
          </ul>
        </details>
      </div>
    </Shell>
  );
}
