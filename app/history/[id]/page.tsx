'use client';

import { motion } from 'motion/react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Ball } from '@/components/Ball';
import { BingoCardView } from '@/components/BingoCardView';
import { PatternPreview } from '@/components/Pattern';
import { useDialogs, useToast } from '@/components/Providers';
import { IconButton, Shell } from '@/components/Shell';
import { Chip, EmptyState, Icon, Panel, SectionTitle, Spinner } from '@/components/ui';
import { api } from '@/lib/client/api';
import { formatDateTime, plural } from '@/lib/client/format';
import type { BingoCard } from '@/lib/game/card';
import { PATTERNS } from '@/lib/game/pattern';
import { isPaperWinner, type GameRound, type GameSession } from '@/lib/game/types';

interface Detail {
  session: GameSession;
  rounds: GameRound[];
  cards: BingoCard[];
  active: boolean;
}

/** Rounds, winners and the full call order of one session. */
export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const dialogs = useDialogs();
  const toast = useToast();
  const [data, setData] = useState<Detail | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Detail>(`/api/sessions/${params.id}`));
    } catch {
      setData(null);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const rename = async () => {
    if (!data) return;
    const name = await dialogs.prompt({ title: 'Rename session', label: 'Session name', initial: data.session.name, maxLength: 30, validator: (v) => (v.trim() ? null : 'Enter a name.') });
    if (!name) return;
    await api.put(`/api/sessions/${data.session.id}`, { name });
    await load();
  };

  const remove = async () => {
    if (!data) return;
    const ok = await dialogs.confirm({ title: `Delete "${data.session.name}"?`, message: 'Its rounds and card records are removed. This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/sessions/${data.session.id}`);
      router.replace('/history');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: 'danger', icon: <Icon.Info /> });
    }
  };

  if (data === undefined) {
    return (
      <Shell title="Session" backHref="/history">
        <div className="flex justify-center py-24">
          <Spinner size={30} />
        </div>
      </Shell>
    );
  }
  if (data === null) {
    return (
      <Shell title="Session" backHref="/history">
        <EmptyState icon={<Icon.History />} title="Not found" message="This session is no longer in History." />
      </Shell>
    );
  }
  const s = data.session;
  const role = s.role === 'caller' ? 'Ball Caller' : s.role[0].toUpperCase() + s.role.slice(1);
  return (
    <Shell
      title={s.name}
      subtitle={`${role} · Room ${s.code}`}
      backHref="/history"
      actions={
        <>
          <IconButton label="Rename" onClick={rename}>
            <Icon.Edit />
          </IconButton>
          <IconButton label="Delete" onClick={remove} disabled={data.active}>
            <Icon.Trash />
          </IconButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Panel>
          <Row k="Host" v={s.hostName} />
          <Row k="Status" v={s.status} />
          <Row k="Started" v={formatDateTime(s.createdAt)} />
          <Row k="Last activity" v={formatDateTime(s.updatedAt)} />
          {s.endedAt && <Row k="Ended" v={formatDateTime(s.endedAt)} />}
          {s.hostAddress && <Row k="Address" v={s.hostAddress} />}
          <Row k="Players" v={s.players.length ? s.players.join(', ') : '—'} />
        </Panel>
        <SectionTitle>Rounds ({data.rounds.length})</SectionTitle>
        {data.rounds.length === 0 && <p className="text-center italic text-ink-soft">No rounds were played in this session.</p>}
        {data.rounds.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
            <RoundCard round={r} />
          </motion.div>
        ))}
        {data.cards.length > 0 && (
          <>
            <SectionTitle>Cards used ({data.cards.length})</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {data.cards.map((c) => (
                <BingoCardView key={c.id} card={c} title={c.name} compact />
              ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-28 shrink-0 font-bold text-ink-soft">{k}</span>
      <span className="min-w-0 break-words">{v}</span>
    </div>
  );
}

function RoundCard({ round: r }: { round: GameRound }) {
  const [open, setOpen] = useState(false);
  const [label, color, icon] =
    r.status === 'won'
      ? (['Won', 'success', <Icon.Trophy key="i" className="size-3.5" />] as const)
      : r.status === 'paused'
        ? (['Paused', 'gold', <Icon.Pause key="i" className="size-3.5" />] as const)
        : r.status === 'playing'
          ? (['In play', 'blue', <Icon.Play key="i" className="size-3.5" />] as const)
          : (['Stopped', 'ink', <Icon.Stop key="i" className="size-3.5" />] as const);
  return (
    <Panel className="p-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3.5 text-left">
        <PatternPreview pattern={r.pattern} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] text-burgundy">
            Round {r.number} · {PATTERNS[r.pattern].label}
          </span>
          <span className="block text-[12.5px] text-ink-soft">
            {r.called.length} called ·{' '}
            {r.winnerName == null ? 'no winner' : r.winners.length > 1 ? `${r.winners.length} winners: ${r.winnerName}` : `won by ${r.winnerName}`}
          </span>
          <span className="block text-[12.5px] text-ink-soft">{formatDateTime(r.startedAt)}</span>
        </span>
        <Chip color={color} icon={icon}>
          {label}
        </Chip>
      </button>
      {open && (
        <div className="border-t border-gold/40 px-3.5 pb-3.5 pt-3">
          {r.winners.map((w) => (
            <div key={`${w.playerName}-${w.cardName}`} className="mb-3">
              <div className="flex items-center gap-2 font-bold">
                <Icon.Trophy className="size-5 text-gold" />
                {isPaperWinner(w) ? `${w.playerName} with a paper card · ${plural(w.calledCount, 'call')}` : `${w.playerName} with "${w.cardName}" · ${plural(w.calledCount, 'call')}`}
              </div>
              {!isPaperWinner(w) && (
                <div className="mt-2 max-w-sm">
                  <BingoCardView card={{ grid: w.grid, marked: w.cells.map((i) => w.grid[Math.floor(i / 5)][i % 5]) }} highlight={w.cells} compact />
                </div>
              )}
            </div>
          ))}
          <div className="font-bold text-ink-soft">Call order</div>
          {r.called.length === 0 ? (
            <p className="italic text-ink-soft">No numbers were called.</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.called.map((n) => (
                <Ball key={n} number={n} size={36} />
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
