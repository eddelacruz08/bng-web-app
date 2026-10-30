'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { useDialogs, useToast } from '@/components/Providers';
import { IconButton, Shell } from '@/components/Shell';
import { Button, Chip, EmptyState, Icon, Panel, Spinner } from '@/components/ui';
import { api } from '@/lib/client/api';
import { formatDateTime, plural } from '@/lib/client/format';
import { getClientId } from '@/lib/client/identity';
import type { GameSession, SessionRole, SessionStatus } from '@/lib/game/types';

export function roleIcon(r: SessionRole): ReactNode {
  return r === 'host' ? <Icon.Mic /> : r === 'caller' ? <Icon.Casino /> : <Icon.People />;
}

export function roleColor(r: SessionRole): string {
  return r === 'host' ? '#7a1e2b' : r === 'caller' ? '#6b5544' : '#1e4d8c';
}

export function roleLabel(r: SessionRole): string {
  return r === 'host' ? 'Hosted' : r === 'caller' ? 'Ball Caller' : 'Joined';
}

export function StatusChip({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'paused':
      return (
        <Chip color="gold" icon={<Icon.Pause className="size-3.5" />}>
          Paused
        </Chip>
      );
    case 'playing':
      return (
        <Chip color="success" icon={<Icon.Play className="size-3.5" />}>
          In play
        </Chip>
      );
    case 'lobby':
      return (
        <Chip color="blue" icon={<Icon.Door className="size-3.5" />}>
          Open
        </Chip>
      );
    default:
      return (
        <Chip color="ink" icon={<Icon.Flag className="size-3.5" />}>
          Finished
        </Chip>
      );
  }
}

/** Every session this server hosted, called or (this browser) joined, with resume and deletion. */
export default function HistoryPage() {
  const router = useRouter();
  const dialogs = useDialogs();
  const toast = useToast();
  const [sessions, setSessions] = useState<GameSession[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const r = await api.get<{ sessions: GameSession[]; roundCounts: Record<string, number> }>('/api/sessions');
    setSessions(r.sessions);
    setCounts(r.roundCounts);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), { tone: 'danger', icon: <Icon.Info /> });

  const clearAll = async () => {
    const ok = await dialogs.confirm({
      title: 'Clear all history?',
      message: 'Every session, round and in-game card record on this server will be deleted. Saved cards under "My Cards" stay.',
      confirmLabel: 'Clear All',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del('/api/sessions');
      toast('History cleared', { icon: <Icon.Trash /> });
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (s: GameSession) => {
    const ok = await dialogs.confirm({ title: `Delete "${s.name}"?`, message: 'Its rounds and card records are removed. This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/sessions/${s.id}`);
      toast('Session deleted', { icon: <Icon.Trash /> });
      await load();
    } catch (e) {
      fail(e);
    }
  };

  const rename = async (s: GameSession) => {
    const name = await dialogs.prompt({ title: 'Rename session', label: 'Session name', initial: s.name, maxLength: 30, validator: (v) => (v.trim() ? null : 'Enter a name.') });
    if (!name) return;
    await api.put(`/api/sessions/${s.id}`, { name });
    await load();
  };

  const menu = async (s: GameSession) => {
    const choice = await dialogs.sheet({
      title: s.name,
      options: [
        { key: 'rename', label: 'Rename', icon: <Icon.Edit />, tone: 'gold' },
        { key: 'delete', label: 'Delete', description: 'Removes the session with its rounds and cards.', icon: <Icon.Trash />, tone: 'danger' },
      ],
    });
    if (choice === 'rename') await rename(s);
    else if (choice === 'delete') await remove(s);
  };

  const resume = (s: GameSession) => {
    if (s.role === 'player') router.push(`/play?rejoin=${encodeURIComponent(s.id)}`);
    else router.push(`/${s.role}?resume=${encodeURIComponent(s.id)}`);
  };

  const mine = typeof window === 'undefined' ? '' : getClientId();

  return (
    <Shell
      title="History"
      subtitle="Sessions saved on this server"
      actions={
        <IconButton label="Clear all" onClick={clearAll} disabled={!sessions?.length}>
          <Icon.Trash />
        </IconButton>
      }
    >
      {sessions === null ? (
        <div className="flex justify-center py-24">
          <Spinner size={30} />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={<Icon.History />} title="Nothing here yet" message="Host, join, or call a game and it will be saved here automatically." />
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {sessions.map((s) => {
              const rounds = counts[s.id] ?? 0;
              const canResume =
                s.role === 'player'
                  ? s.status !== 'finished' && s.ownerClientId === mine
                  : s.status === 'lobby' || s.status === 'paused';
              return (
                <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <Panel className="flex items-start gap-3 py-3 pl-3.5 pr-1.5">
                    <div
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/history/${s.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') router.push(`/history/${s.id}`);
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
                    >
                      <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-cream" style={{ background: roleColor(s.role) }}>
                        {roleIcon(s.role)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[16px] text-burgundy">{s.name}</span>
                        <span className="block text-[13px] text-ink-soft">
                          {roleLabel(s.role)} · {plural(s.players.length, 'player')} · {plural(rounds, 'round')}
                        </span>
                        <span className="block text-[12px] text-ink-soft">{formatDateTime(s.updatedAt)}</span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <StatusChip status={s.status} />
                          {canResume && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                resume(s);
                              }}
                              icon={<Icon.Play className="size-4" />}
                            >
                              {s.role === 'player' ? 'Rejoin' : 'Resume'}
                            </Button>
                          )}
                        </span>
                      </span>
                    </div>
                    <button aria-label="Options" onClick={() => menu(s)} className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/8">
                      <Icon.More className="size-5" />
                    </button>
                  </Panel>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </Shell>
  );
}
