'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { AutoBingoDialog } from '@/components/AutoBingoDialog';
import { CurrentBall } from '@/components/Ball';
import { BingoCardView } from '@/components/BingoCardView';
import { RecentCalls } from '@/components/CalledBoard';
import { useDialogs, useToast } from '@/components/Providers';
import { IconButton, Shell } from '@/components/Shell';
import { Avatar, Button, EmptyState, Icon, Panel, Spinner, Switch, cx } from '@/components/ui';
import { WinOverlay } from '@/components/WinOverlay';
import { useAppState } from '@/lib/client/app-state';
import { hub, useHubEvents, usePlayerState } from '@/lib/client/hub';
import { plural } from '@/lib/client/format';
import { letterFor, type BingoCard } from '@/lib/game/card';
import { PATTERNS, isSatisfied, winningCells } from '@/lib/game/pattern';
import { winnerNames, type PlayerSnapshot } from '@/lib/game/types';

const MAX_CARDS = 6;

interface AutoBingo {
  card: BingoCard;
  patternLabel: string;
  cells: number[];
  confirmed: null | { roundNumber: number };
}

export default function PlayPage() {
  const router = useRouter();
  const app = useAppState();
  const dialogs = useDialogs();
  const toast = useToast();
  const state = usePlayerState();
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const [autoBingo, setAutoBingo] = useState<AutoBingo | null>(null);
  const [winOpen, setWinOpen] = useState(false);
  const [fitAll, setFitAll] = useState(false);
  const [page, setPage] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const rejoined = useRef(false);
  const leaving = useRef(false);
  const send = (t: string, d: Record<string, unknown> = {}) => hub().send(t, d);

  // Rejoin a saved session when History or Home asked for it.
  useEffect(() => {
    if (rejoined.current || !app.loaded) return;
    const q = new URLSearchParams(window.location.search);
    const id = q.get('rejoin');
    if (id) {
      rejoined.current = true;
      send('player_rejoin', { sessionId: id, autoDaub: app.settings.autoDaub, name: app.active?.name ?? '' });
      window.history.replaceState(null, '', '/play');
    }
  }, [app.loaded, app.settings.autoDaub, app.active?.name]);

  useHubEvents((ev) => {
    switch (ev.t) {
      case 'toast':
        if (ev.d.slot === 'player') toast(ev.d.message);
        break;
      case 'number':
        if (ev.d.slot === 'player' && 'vibrate' in navigator) navigator.vibrate?.(12);
        break;
      case 'auto_bingo': {
        const pattern = state?.round?.pattern ?? 'straightDiagonal';
        dialogs.closeAll();
        if ('vibrate' in navigator) navigator.vibrate?.([30, 40, 60]);
        setAutoBingo({ card: ev.d.card, patternLabel: PATTERNS[pattern].label, cells: [...winningCells(pattern, ev.d.card)], confirmed: null });
        break;
      }
      case 'claim_rejected':
        setAutoBingo(null);
        toast(ev.d.reason, { icon: <Icon.Info />, duration: 4000 });
        break;
      case 'win':
        if (ev.d.slot !== 'player') break;
        if (autoBingo) {
          setAutoBingo((s) => (s ? { ...s, confirmed: { roundNumber: ev.d.winner.roundNumber } } : s));
        } else {
          dialogs.closeAll();
          setWinOpen(true);
        }
        break;
      case 'closed':
        if (ev.d.slot === 'player' && !leaving.current) router.replace('/');
        break;
      case 'error':
        toast(ev.d.message, { tone: 'danger', icon: <Icon.Info /> });
        break;
    }
  });

  // Carousel: track which card is centred for the page dots.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.firstElementChild?.getBoundingClientRect().width ?? 1;
      setPage(Math.round(el.scrollLeft / (w + 12)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [state?.cards.length, fitAll]);

  const goHome = () => {
    leaving.current = true;
    send('player_leave');
    router.push('/');
  };

  const leave = async () => {
    if (!state || state.phase === 'ended' || state.phase === 'disconnected') {
      goHome();
      return;
    }
    const ok = await dialogs.confirm({
      title: 'Leave the lobby?',
      message:
        state.phase === 'playing'
          ? 'Your cards and marks are saved here. You can rejoin from Home or History while the round is running.'
          : 'You can rejoin from "Join a Game", Home or History.',
      confirmLabel: 'Leave',
      danger: true,
      icon: <Icon.Door className="size-9 text-danger" />,
    });
    if (ok) goHome();
  };

  const addCard = () => {
    if (!state) return;
    if (!state.canAddCards) return toast('Cards can only be added between rounds.', { icon: <Icon.Info /> });
    if (state.cards.length >= MAX_CARDS) return toast(`You can play up to ${MAX_CARDS} cards at once.`, { icon: <Icon.Info /> });
    send('player_add_card');
    setTimeout(() => rowRef.current?.scrollTo({ left: rowRef.current.scrollWidth, behavior: 'smooth' }), 350);
  };

  const claim = async (card: BingoCard) => {
    if (!state?.round) return;
    const ok = await dialogs.confirm({
      title: 'Call BINGO?',
      message: `The host will check "${card.name}" for ${PATTERNS[state.round.pattern].label}. A wrong call is announced to everyone.`,
      confirmLabel: 'BINGO!',
      icon: <Icon.Celebrate className="size-9 text-gold" />,
    });
    if (ok) send('player_claim', { cardId: card.id });
  };

  const cardMenu = async (card: BingoCard) => {
    const choice = await dialogs.sheet({
      title: card.name,
      options: [
        { key: 'rename', label: 'Rename', icon: <Icon.Edit />, tone: 'gold' },
        { key: 'remove', label: 'Remove from game', description: 'Saved cards under "My Cards" are not affected.', icon: <Icon.Trash />, tone: 'danger' },
      ],
    });
    if (choice === 'rename') {
      const name = await dialogs.prompt({ title: 'Rename card', label: 'Card name', initial: card.name, maxLength: 20, validator: (v) => (v.trim() ? null : 'Enter a name.') });
      if (name) send('player_rename_card', { cardId: card.id, name });
    } else if (choice === 'remove') {
      const ok = await dialogs.confirm({ title: `Remove "${card.name}"?`, message: 'This card and its marks leave the game.', confirmLabel: 'Remove', danger: true });
      if (ok) send('player_remove_card', { cardId: card.id });
    }
  };

  const showPlayers = () => {
    const s = stateRef.current;
    if (!s) return;
    void dialogs.custom(
      () => (
        <div className="px-4 pt-3 pb-2">
          <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-gold" />
          <h2 className="font-display text-[18px] text-burgundy">In the lobby ({s.players.length})</h2>
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-3 py-2">
              <span className="flex size-10 items-center justify-center rounded-full bg-gold text-ink">
                <Icon.Mic />
              </span>
              <span>
                <span className="block font-bold">{s.hostName}</span>
                <span className="block text-[13px] text-ink-soft">Host / caller</span>
              </span>
            </div>
            {s.players.map((p) => (
              <div key={p.name} className="flex items-center gap-3 py-2">
                <Avatar name={p.name} />
                <span>
                  <span className="block font-bold">{p.name === s.playerName ? `${p.name} (you)` : p.name}</span>
                  <span className="block text-[13px] text-ink-soft">
                    {plural(p.cardCount, 'card')}
                    {p.waiting ? ' · waits for next round' : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
      { sheet: true },
    );
  };

  const onCellTap = (card: BingoCard, n: number) => {
    if (!state) return;
    if (state.phase === 'playing') send('player_toggle_mark', { cardId: card.id, number: n });
    else if (state.phase === 'waitingRound') toast('You joined mid-round. You play from the next round.', { icon: <Icon.Hourglass /> });
    else if (state.phase === 'reconnecting') toast('Reconnecting to the host...', { icon: <Icon.Wifi /> });
    else toast('Marks open when the round starts.', { icon: <Icon.Info /> });
  };

  // ------------------------------------------------------------------ render

  const title = state?.sessionName || 'Joining...';
  const subtitle = state ? (state.hostName ? `Host ${state.hostName} · Room ${state.code}` : `${state.host}:${state.port}`) : '';

  if (state === undefined) {
    return (
      <Shell title={title} onBack={() => router.push('/')}>
        <div className="flex justify-center py-24">
          <Spinner size={30} />
        </div>
      </Shell>
    );
  }
  if (state === null) {
    return (
      <Shell title="Play" subtitle="No game in progress" onBack={() => router.push('/')}>
        <EmptyState
          icon={<Icon.Wifi />}
          title="You are not in a game"
          message="Join a lobby on this network and your cards appear here."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/')}>
                Home
              </Button>
              <Button onClick={() => router.push('/join')} icon={<Icon.Door className="size-5" />}>
                Join a Game
              </Button>
            </div>
          }
        />
      </Shell>
    );
  }

  const inGame = !['connecting', 'disconnected', 'ended'].includes(state.phase);
  const playing = state.phase === 'playing';
  const canClaim = (card: BingoCard) => state.canStillClaim && !state.claimPending && !!state.round && isSatisfied(state.round.pattern, card);

  const cardColumn = (card: BingoCard, compact = false) => (
    <div className="flex flex-col gap-2.5">
      <BingoCardView
        card={card}
        compact={compact}
        called={playing ? new Set(state.called) : undefined}
        highlight={state.highlightCardId === card.id ? state.highlightCells : []}
        title={card.name}
        trailing={
          <button aria-label="Card options" onClick={() => cardMenu(card)} className="-mr-1 flex size-8 items-center justify-center rounded-full text-ink-soft hover:bg-ink/8">
            <Icon.More className="size-5" />
          </button>
        }
        onCellTap={(_c, _r, n) => onCellTap(card, n)}
      />
      <Button
        variant="gold"
        size={compact ? 'md' : 'lg'}
        full
        disabled={!canClaim(card)}
        onClick={() => claim(card)}
        className="tracking-[.15em]"
        icon={state.claimPending ? <Spinner size={18} /> : <Icon.Celebrate className="size-5" />}
      >
        {state.claimPending ? 'CHECKING...' : 'BINGO!'}
      </Button>
    </div>
  );

  return (
    <>
      <Shell
        title={title}
        subtitle={subtitle}
        onBack={leave}
        wide={inGame}
        actions={
          inGame ? (
            <>
              {state.cards.length > 1 && (
                <IconButton label={fitAll ? 'One card at a time' : 'Fit all cards on screen'} onClick={() => setFitAll((v) => !v)}>
                  {fitAll ? <Icon.Carousel /> : <Icon.Grid />}
                </IconButton>
              )}
              <IconButton label="Players" onClick={showPlayers}>
                <Icon.People />
              </IconButton>
            </>
          ) : undefined
        }
        fab={
          inGame && state.canAddCards ? (
            <Button variant="gold" size="lg" onClick={addCard} icon={<Icon.Plus className="size-5" />} className="shadow-xl">
              Add Card
            </Button>
          ) : undefined
        }
        bottom={
          inGame ? (
            <div className="flex items-center gap-3">
              <Switch checked={state.autoDaub} onChange={(on) => send('player_auto_daub', { on })} label="Auto-daub" />
              <span className="flex-1 text-[15px]">Auto-daub called numbers</span>
              <span className="font-bold text-gold-light">
                {state.cards.length}/{MAX_CARDS} cards
              </span>
            </div>
          ) : undefined
        }
      >
        {state.phase === 'connecting' ? (
          <div className="flex flex-col items-center gap-3 py-24 text-ink-soft">
            <Spinner size={30} />
            <span>Connecting to the host...</span>
          </div>
        ) : state.phase === 'disconnected' ? (
          <EmptyState
            icon={<Icon.Wifi />}
            title="Not connected"
            message={state.error ?? 'The connection was lost.'}
            action={
              <div className="flex flex-col items-center gap-2">
                <Button onClick={() => send('player_retry')} icon={<Icon.Refresh className="size-5" />}>
                  Try again
                </Button>
                <Button variant="ghost" onClick={goHome}>
                  Back
                </Button>
              </div>
            }
          />
        ) : state.phase === 'ended' ? (
          <EmptyState icon={<Icon.Flag />} title="Session ended" message={state.error ?? 'The host closed the lobby. Thanks for playing!'} action={<Button onClick={goHome}>Back to Home</Button>} />
        ) : (
          <GameBody state={state} fitAll={fitAll} page={page} rowRef={rowRef} cardColumn={cardColumn} onAddCard={addCard} onCancelReconnect={() => send('player_cancel_reconnect')} />
        )}
      </Shell>
      <AnimatePresence>
        {autoBingo && (
          <AutoBingoDialog
            key="auto"
            state={{
              card: autoBingo.card,
              patternLabel: autoBingo.patternLabel,
              cells: autoBingo.cells,
              confirmed: autoBingo.confirmed
                ? { roundNumber: autoBingo.confirmed.roundNumber, others: state.winners.filter((w) => !w.isMe).map((w) => w.playerName) }
                : null,
            }}
            onSeeWinners={() => {
              setAutoBingo(null);
              setWinOpen(true);
            }}
          />
        )}
        {winOpen && (
          <WinOverlay
            key="win"
            winners={state.winners}
            viewerIsHost={false}
            playerName={state.playerName}
            onClose={() => {
              setWinOpen(false);
              send('player_back_to_lobby');
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function GameBody({
  state,
  fitAll,
  page,
  rowRef,
  cardColumn,
  onAddCard,
  onCancelReconnect,
}: {
  state: PlayerSnapshot;
  fitAll: boolean;
  page: number;
  rowRef: React.RefObject<HTMLDivElement | null>;
  cardColumn: (card: BingoCard, compact?: boolean) => ReactNode;
  onAddCard: () => void;
  onCancelReconnect: () => void;
}) {
  const playing = state.phase === 'playing';
  const showBall = playing || state.phase === 'won' || state.phase === 'waitingRound';
  const n = state.currentNumber;
  const r = state.round;
  const [title, sub, color, icon]: [string, string, string, ReactNode] = (() => {
    switch (state.phase) {
      case 'reconnecting':
        return ['Connection lost', `Reconnecting to the host... attempt ${state.reconnectAttempts}. Your cards are safe.`, 'text-danger', <Spinner key="s" size={26} />];
      case 'paused':
        return ['Game paused', 'The host saved the game. You rejoin by yourself when the host resumes.', 'text-gold', <Icon.Pause key="i" className="size-7" />];
      case 'waitingRound':
        return [`Round ${r?.number ?? ''} in progress`, 'You joined mid-round, so you watch this one and play from the next round.', 'text-gold', <Icon.Hourglass key="i" className="size-7" />];
      case 'playing':
        return [`Round ${r!.number} · ${PATTERNS[r!.pattern].label}`, `${state.called.length} of 75 called · ${PATTERNS[r!.pattern].description}`, 'text-success', <Icon.Play key="i" className="size-7" />];
      case 'won':
        return ['Round over', `${winnerNames(state.winners)} won. Add or remove cards now; they play from the next round.`, 'text-burgundy', <Icon.Trophy key="i" className="size-7" />];
      default:
        return state.cards.length === 0
          ? ['Add a card to play', 'You need at least one card before the host starts, or you sit the round out.', 'text-danger', <Icon.Card key="i" className="size-7" />]
          : ['Waiting for the host', `Add your cards while you wait. Up to ${MAX_CARDS} per round.`, 'text-ball-b', <Icon.Hourglass key="i" className="size-7" />];
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      <Panel className={cx('flex items-center gap-3 px-3.5 py-2.5', state.phase === 'reconnecting' && 'bg-danger/8')}>
        <span className={color}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] text-burgundy">{title}</span>
          <span className="block text-[12.5px] text-ink-soft">{sub}</span>
        </span>
        {state.phase === 'reconnecting' && (
          <Button variant="ghost" size="sm" onClick={onCancelReconnect}>
            Stop
          </Button>
        )}
      </Panel>

      {showBall && (
        <div className="flex items-center gap-3 px-1">
          <CurrentBall number={n} size={76} />
          <div className="shrink-0">
            <div className="font-display text-[22px] text-burgundy">{n == null ? '—' : `${letterFor(n)}-${n}`}</div>
            <div className="text-[12px] text-ink-soft">last called</div>
          </div>
          <div className="min-w-0 flex-1">
            <RecentCalls called={state.called.length > 1 ? state.called.slice(0, -1) : []} count={6} size={36} />
          </div>
        </div>
      )}

      {state.cards.length === 0 ? (
        <EmptyState
          icon={<Icon.Card />}
          title="No cards yet"
          message="Tap Add Card and a random card is dealt to you. Auto-daub marks called numbers for you."
          action={
            <Button onClick={onAddCard} icon={<Icon.Plus className="size-5" />}>
              Add a card
            </Button>
          }
        />
      ) : fitAll ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {state.cards.map((c) => (
            <div key={c.id}>{cardColumn(c, true)}</div>
          ))}
        </div>
      ) : (
        <>
          <div ref={rowRef} className="snap-row -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 pt-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
            {state.cards.map((c) => (
              <motion.div key={c.id} layout className="w-[88vw] max-w-[440px] shrink-0 md:w-auto md:max-w-none" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                {cardColumn(c)}
              </motion.div>
            ))}
          </div>
          {state.cards.length > 1 && (
            <div className="flex justify-center gap-1.5 md:hidden">
              {state.cards.map((c, i) => (
                <span key={c.id} className={cx('h-2 rounded-full transition-all duration-250', i === page ? 'w-[18px] bg-burgundy' : 'w-2 bg-gold')} />
              ))}
            </div>
          )}
        </>
      )}
      <div className="h-16" />
    </div>
  );
}
