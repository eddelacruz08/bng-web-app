'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useAppState } from '@/lib/client/app-state';
import { hub, useDeskState, useHubEvents } from '@/lib/client/hub';
import { plural } from '@/lib/client/format';
import { letterFor } from '@/lib/game/card';
import { PATTERNS, type WinPattern } from '@/lib/game/pattern';
import { isPaperWinner, winnerNames, type HostSnapshot } from '@/lib/game/types';
import { BallTumbler } from './BallTumbler';
import { CalledBoard, RecentCalls } from './CalledBoard';
import { PatternPreview, pickPattern } from './Pattern';
import { useDialogs, useToast } from './Providers';
import { QrCode } from './QrCode';
import { IconButton, Shell } from './Shell';
import { Avatar, Button, Chip, EmptyState, Icon, Panel, SectionTitle, Spinner, Switch, cx } from './ui';
import { WinOverlay } from './WinOverlay';

type Slot = 'host' | 'caller';

const AUTO_PRESETS = [3, 5, 8, 10, 15];

/**
 * The caller's desk: the host lobby + caller view (`slot: 'host'`), or the
 * Ball Caller for paper cards (`slot: 'caller'`). State lives on the server;
 * this page sends commands and renders the snapshots it gets back.
 */
export function DeskPage({ slot }: { slot: Slot }) {
  const router = useRouter();
  const app = useAppState();
  const dialogs = useDialogs();
  const toast = useToast();
  const state = useDeskState(slot);
  const [pattern, setPattern] = useState<WinPattern>('straightDiagonal');
  const [winOpen, setWinOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const opened = useRef(false);
  const send = (t: string, d: Record<string, unknown> = {}) => hub().send(t, { ...d, slot });

  // Open or resume when the URL asks for it and nothing is open yet.
  useEffect(() => {
    if (state !== null || opened.current || !app.loaded) return;
    const q = new URLSearchParams(window.location.search);
    const hostName = app.active?.name ?? (slot === 'caller' ? 'Caller' : 'Host');
    if (q.get('open')) {
      opened.current = true;
      setOpening(true);
      send('host_open', { hostName, lobbyName: q.get('name') ?? '', autoCallSeconds: app.settings.autoCallSeconds });
    } else if (q.get('resume')) {
      opened.current = true;
      setOpening(true);
      send('host_resume', { sessionId: q.get('resume'), autoCallSeconds: app.settings.autoCallSeconds });
    }
    if (q.get('open') || q.get('resume')) window.history.replaceState(null, '', `/${slot}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, app.loaded]);

  useEffect(() => {
    if (state) setOpening(false);
  }, [state]);

  const roundId = state?.round?.id;
  const roundPattern = state?.round?.pattern;
  useEffect(() => {
    if (roundPattern) setPattern(roundPattern);
  }, [roundId, roundPattern]);

  useHubEvents((ev) => {
    if (ev.t === 'toast' && ev.d.slot === slot) toast(ev.d.message);
    else if (ev.t === 'win' && ev.d.slot === slot) {
      dialogs.closeAll();
      setWinOpen(true);
    } else if (ev.t === 'closed' && ev.d.slot === slot) router.replace(`/?result=${ev.d.result}`);
    else if (ev.t === 'error') {
      setOpenError(ev.d.message);
      setOpening(false);
      toast(ev.d.message, { tone: 'danger', icon: <Icon.Info /> });
    }
  });

  // ---------------------------------------------------------------- actions

  const leave = async () => {
    if (!state) {
      router.push('/');
      return;
    }
    const inRound = state.round?.status === 'playing' || state.round?.status === 'paused';
    const isCaller = slot === 'caller';
    const choice = await dialogs.choice({
      title: inRound ? (isCaller ? "Leave the caller's desk?" : 'Leave the game?') : isCaller ? 'Close the Ball Caller?' : 'Close the lobby?',
      message: inRound
        ? `Save & Close keeps round ${state.round!.number} with every number called, so you can continue later from History. End Session finishes it for good.`
        : 'Save & Close keeps this session in History so you can reopen it. End Session marks it finished.',
      choices: [
        { key: 'save', label: 'Save & Close', variant: 'outline', icon: <Icon.Save className="size-5" /> },
        { key: 'end', label: 'End Session', variant: 'danger', icon: <Icon.Close className="size-5" /> },
      ],
    });
    if (!choice) return;
    if (choice === 'save') {
      send('host_stop_save');
      return;
    }
    const ok = await dialogs.confirm({
      title: 'End this session?',
      message: isCaller
        ? 'The caller session is marked finished. Its rounds and winners stay in History.'
        : 'Players will be disconnected and the session is marked finished. Its history stays saved.',
      confirmLabel: 'End Session',
      danger: true,
    });
    if (ok) send('host_end_session');
  };

  const choosePattern = async () => {
    const p = await pickPattern(dialogs, pattern);
    if (p) setPattern(p);
  };

  const startRound = async (p: WinPattern = pattern) => {
    if (!state) return;
    if (slot === 'host') {
      if (state.players.length === 0) {
        await dialogs.info({ title: 'No players yet', message: 'Wait for at least one player to join before starting a round.', icon: <Icon.People className="size-9 text-gold" /> });
        return;
      }
      const ready = state.players.filter((x) => x.cardCount > 0);
      const noCards = state.players.filter((x) => x.cardCount === 0);
      if (ready.length === 0) {
        await dialogs.info({ title: 'Nobody has cards yet', message: 'Players need at least one card to play. Ask them to tap "Add Card" first.', icon: <Icon.Card className="size-9 text-gold" /> });
        return;
      }
      const sitOut = noCards.length ? `\n\n${noCards.map((x) => x.name).join(', ')} ${noCards.length === 1 ? 'has' : 'have'} no cards and will sit this round out.` : '';
      const ok = await dialogs.confirm({
        title: 'Start a new round?',
        message: `Winning combination: ${PATTERNS[p].label}. ${PATTERNS[p].description}\n${plural(ready.length, 'player')} ready.${sitOut}`,
        confirmLabel: 'Start Round',
        icon: <Icon.Play className="size-9 text-gold" />,
      });
      if (!ok) return;
    }
    send('host_start_round', { pattern: p });
  };

  const continueRound = async () => {
    if (!state) return;
    if (slot === 'host' && state.players.length === 0) {
      const ok = await dialogs.confirm({ title: 'No players have rejoined', message: 'Continue anyway? Players can still join while the round runs.', confirmLabel: 'Continue' });
      if (!ok) return;
    }
    send('host_continue');
  };

  const stopAndSave = async () => {
    const ok = await dialogs.confirm({
      title: 'Stop and save?',
      message: 'The round pauses here with all called numbers kept. You can continue from History.',
      confirmLabel: 'Stop & Save',
      icon: <Icon.Save className="size-9 text-gold" />,
    });
    if (ok) send('host_stop_save');
  };

  const recordWinner = async (another = false) => {
    const name = await dialogs.prompt({
      title: another ? 'Who else has BINGO?' : 'Who has BINGO?',
      label: 'Player name (paper card)',
      confirmLabel: 'Record Winner',
      maxLength: 20,
      validator: (v) => {
        if (v.trim().length < 2) return 'Enter at least 2 letters.';
        if (state?.round?.winners.some((w) => w.playerName.toLowerCase() === v.trim().toLowerCase())) return 'Already recorded as a winner.';
        return null;
      },
    });
    if (name) send('host_paper_winner', { name });
  };

  const nextRound = async () => {
    const ended = state?.round?.number;
    send('host_close_round');
    if (ended) toast(`Round ${ended} closed. Choose the next combination.`, { icon: <Icon.Next /> });
    const p = await pickPattern(dialogs, pattern);
    if (!p) return;
    setPattern(p);
    await startRound(p);
  };

  const endRound = async () => {
    const r = state?.round;
    if (!r || state?.drawing) return;
    const choice = await dialogs.sheet({
      title: `End round ${r.number}?`,
      subtitle: `${state!.called.length} numbers called · ${PATTERNS[r.pattern].label}`,
      cancelLabel: slot === 'caller' ? 'Keep calling' : 'Keep playing',
      options: [
        {
          key: 'winner',
          label: slot === 'caller' ? 'Someone has BINGO' : 'A paper-card player won',
          description: slot === 'caller' ? "Check the paper card against the board, then record the winner's name." : 'Check their physical card, then record their name as the winner.',
          icon: <Icon.Trophy />,
          tone: 'gold',
        },
        { key: 'next', label: 'No winner · start next round', description: 'End this round and choose the next combination.', icon: <Icon.Next />, tone: 'burgundy' },
        {
          key: 'close',
          label: slot === 'caller' ? 'No winner · stop here' : 'No winner · back to the lobby',
          description: slot === 'caller' ? 'End this round and go back to the desk.' : 'End this round and wait in the lobby.',
          icon: <Icon.Stop />,
          tone: 'parchment',
        },
      ],
    });
    if (choice === 'winner') await recordWinner();
    else if (choice === 'next') await nextRound();
    else if (choice === 'close') {
      send('host_close_round');
      toast(`Round ${r.number} ended with no winner`, { icon: <Icon.Flag /> });
    }
  };

  const undo = async () => {
    const last = state?.round?.called.at(-1);
    if (last == null) return;
    const ok = await dialogs.confirm({
      title: `Take back ${letterFor(last)}-${last}?`,
      message: 'The ball goes back into the cage and can be drawn again later.',
      confirmLabel: 'Take it back',
      icon: <Icon.Undo className="size-9 text-gold" />,
    });
    if (ok) {
      send('host_undo');
      toast(`${letterFor(last)}-${last} taken back`, { icon: <Icon.Undo /> });
    }
  };

  const endSession = async () => {
    const ok = await dialogs.confirm({
      title: 'End this session?',
      message: slot === 'caller' ? 'The caller session is marked finished.' : 'Players will be disconnected and the session is marked finished.',
      confirmLabel: 'End Session',
      danger: true,
    });
    if (ok) send('host_end_session');
  };

  const connectionInfo = () =>
    dialogs.info({
      title: 'How players join',
      icon: <Icon.Wifi className="size-9 text-gold" />,
      message: `Phones: open Classic Bingo on the same network and tap "Join a Game". This lobby appears automatically, or they type\n\n${state?.hostIp ?? 'no network address found'}  port ${state?.port ?? 7575}\n\nBrowsers: open this web app's address on the same network and tap "Join a Game".\n\nRoom code ${state?.session.code ?? ''}.`,
    });

  const openNow = async () => {
    const name = await dialogs.prompt({
      title: slot === 'caller' ? 'Name this caller session' : 'Name your bingo hall',
      label: slot === 'caller' ? 'Session name' : 'Lobby name',
      initial: slot === 'caller' ? 'Ball Caller' : `${app.active?.name ?? 'My'}'s Bingo Hall`,
      confirmLabel: slot === 'caller' ? 'Open the Desk' : 'Open Lobby',
      maxLength: 30,
      validator: (v) => (v.trim() ? null : 'Give it a name.'),
    });
    if (!name) return;
    setOpenError(null);
    setOpening(true);
    opened.current = true;
    send('host_open', { hostName: app.active?.name ?? (slot === 'caller' ? 'Caller' : 'Host'), lobbyName: name, autoCallSeconds: app.settings.autoCallSeconds });
  };

  // ------------------------------------------------------------------ render

  const title = state?.session.name ?? (slot === 'caller' ? 'Ball Caller' : 'Host a Game');
  const subtitle = slot === 'caller' ? 'Ball Caller · paper cards, no players needed' : state ? `Room ${state.session.code} · You are the caller` : 'Opening the lobby...';

  if (state === undefined || (state === null && opening)) {
    return (
      <Shell title={title} subtitle={subtitle} onBack={() => router.push('/')}>
        <div className="flex flex-col items-center gap-3 py-24 text-ink-soft">
          <Spinner size={30} />
          <span>{slot === 'caller' ? 'Opening the desk...' : 'Opening the lobby...'}</span>
        </div>
      </Shell>
    );
  }

  if (state === null) {
    return (
      <Shell title={title} subtitle={slot === 'caller' ? subtitle : 'No lobby open'} onBack={() => router.push('/')}>
        <EmptyState
          icon={openError ? <Icon.Wifi /> : slot === 'caller' ? <Icon.Casino /> : <Icon.Mic />}
          title={openError ? (slot === 'caller' ? 'Could not open the desk' : 'Could not open the lobby') : slot === 'caller' ? 'The desk is closed' : 'No lobby is open'}
          message={openError ?? (slot === 'caller' ? 'Open the Ball Caller to draw numbers for paper cards.' : 'Open a lobby here so phones and browsers on this network can join.')}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/')}>
                Back
              </Button>
              <Button onClick={openNow} icon={<Icon.Play className="size-5" />}>
                {slot === 'caller' ? 'Open the desk' : 'Open a lobby'}
              </Button>
            </div>
          }
        />
      </Shell>
    );
  }

  const r = state.round;
  const onDesk = !!r && (r.status === 'playing' || r.status === 'won');
  const active = r?.status === 'playing';

  return (
    <>
      <Shell
        title={title}
        subtitle={subtitle}
        onBack={leave}
        wide
        actions={
          slot === 'host' ? (
            <IconButton label="How players join" onClick={connectionInfo}>
              <Icon.Wifi />
            </IconButton>
          ) : undefined
        }
        bottom={
          onDesk ? (
            <DeskControls
              state={state}
              slot={slot}
              onCall={() => send('host_call_next')}
              onEndRound={endRound}
              onStopSave={stopAndSave}
              onUndo={undo}
              onAuto={(on) => send('host_auto', { on })}
              onInterval={(seconds) => send('host_interval', { seconds })}
            />
          ) : undefined
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {onDesk ? (
            <motion.div key="desk" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <DeskView state={state} slot={slot} onNextRound={nextRound} onAddWinner={() => recordWinner(true)} onStopSave={stopAndSave} onEndSession={endSession} />
            </motion.div>
          ) : (
            <motion.div key="lobby" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              {slot === 'host' ? (
                <LobbyView state={state} pattern={pattern} onChoosePattern={choosePattern} onStart={() => startRound()} onContinue={continueRound} onStopSave={stopAndSave} onEndSession={endSession} />
              ) : (
                <BetweenRounds state={state} pattern={pattern} onChoosePattern={choosePattern} onStart={() => startRound()} onContinue={continueRound} onLeave={leave} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <span className={cx('hidden', active && 'block')} />
      </Shell>
      <AnimatePresence>{winOpen && <WinOverlay winners={state.winners} viewerIsHost checkedBy={slot === 'caller' ? 'the caller' : 'the host'} onClose={() => setWinOpen(false)} />}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------- lobby (host)

function LobbyView({
  state,
  pattern,
  onChoosePattern,
  onStart,
  onContinue,
  onStopSave,
  onEndSession,
}: {
  state: HostSnapshot;
  pattern: WinPattern;
  onChoosePattern: () => void;
  onStart: () => void;
  onContinue: () => void;
  onStopSave: () => void;
  onEndSession: () => void;
}) {
  const toast = useToast();
  const address = state.hostIp;
  const paused = state.round?.status === 'paused';
  const others = state.addresses.filter((a) => a.ip !== address);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Panel className="flex flex-col items-center p-4 text-center">
          <div className="text-[12px] font-bold tracking-[.2em] text-ink-soft">PLAYERS JOIN AT</div>
          <button
            className="mt-1 font-display text-[30px] leading-tight text-burgundy disabled:text-danger disabled:text-[18px]"
            disabled={!address}
            onClick={() => {
              void navigator.clipboard?.writeText(`${address}:${state.port}`);
              toast('Address copied', { icon: <Icon.Copy /> });
            }}
          >
            {address ?? 'No network address found'}
          </button>
          <div className="text-ink-soft">port {state.port}</div>
          {others.length > 0 && (
            <div className="mt-0.5 text-[12px] text-ink-soft">Also on this computer: {others.map((a) => `${a.ip} (${a.iface})`).join(', ')}</div>
          )}
          {state.joinLink && (
            <div className="mt-3 flex flex-col items-center">
              <QrCode value={state.joinLink} />
              <div className="mt-1 text-[12px] text-ink-soft">Phones: scan with &quot;Join a Game&quot; to enter instantly</div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <span className="font-bold text-ink-soft">Room code</span>
            <span className="rounded-lg bg-gold px-3.5 py-1 font-display text-[24px] tracking-[.3em] text-ink">{state.session.code}</span>
          </div>
          <p className={cx('mt-2.5 text-[13px] italic', state.hostIp ? 'text-ink-soft' : 'font-bold text-danger')}>
            {state.publicUrl
              ? `This lobby is on the internet. Browsers anywhere: open ${state.publicUrl} and tap "Join a Game". Phones: scan the QR code, or type ${state.hostIp} port ${state.port} under "Join a Game".`
              : state.hostIp
                ? 'Everyone must be on the same network. Phones see this lobby under "Join a Game"; browsers open this web app and tap "Join a Game".'
                : 'Network connection lost. Reconnect this computer to the WiFi; the lobby stays open and players rejoin by themselves.'}
          </p>
        </Panel>
        <details className="rounded-xl px-2 py-1 text-ink-soft open:bg-cream/60">
          <summary className="cursor-pointer py-2 font-display text-[15px] text-burgundy">Players can&apos;t connect?</summary>
          <p className="pb-3 text-[13.5px]">
            1. Check every device shows the same WiFi name as this computer.
            <br />
            2. Keep this page open; the lobby closes when the server stops.
            <br />
            3. Office, school, hotel and guest WiFi often block devices from reaching each other. If a phone says the WiFi is blocking, turn on a phone&apos;s hotspot, connect this computer and the players to it, and open the lobby again.
          </p>
        </details>
      </div>

      <div className="flex flex-col gap-4">
        {paused && state.round ? (
          <Panel tone="gold">
            <div className="flex items-center gap-2 font-display text-[17px] text-burgundy">
              <Icon.Pause className="size-6" /> Round {state.round.number} is paused
            </div>
            <p className="mt-1.5 text-[15px]">
              {PATTERNS[state.round.pattern].label} · {state.called.length} numbers already called. Players should rejoin this lobby, then continue.
            </p>
            <Button full className="mt-3" onClick={onContinue} icon={<Icon.Play className="size-5" />}>
              Continue Round
            </Button>
          </Panel>
        ) : (
          <>
            <SectionTitle>Winning combination</SectionTitle>
            <PatternPanel pattern={pattern} onChange={onChoosePattern} />
            <Button size="lg" full onClick={onStart} icon={<Icon.Play className="size-5" />}>
              Start Round · {PATTERNS[pattern].label}
            </Button>
          </>
        )}

        <SectionTitle>Players ({state.players.length})</SectionTitle>
        {state.players.some((p) => p.waiting) && (
          <p className="-mt-2 text-[13px] italic text-ink-soft">Players marked &quot;Next round&quot; connected while a round was running. They watch now and play from the next round.</p>
        )}
        {state.players.length === 0 ? (
          <Panel className="flex items-center gap-3.5 p-4">
            <Spinner />
            <span className="text-ink-soft">Waiting for players to join...</span>
          </Panel>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {state.players.map((p) => (
                <motion.div key={p.name} layout initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }}>
                  <Panel className="flex items-center gap-3 px-3.5 py-2.5">
                    <Avatar name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-bold">{p.name}</span>
                      <span className="block text-[13px] text-ink-soft">
                        {plural(p.cardCount, 'card')} · {p.address}
                      </span>
                    </span>
                    {p.waiting ? (
                      <Chip color="gold" icon={<Icon.Hourglass className="size-3.5" />}>
                        Next round
                      </Chip>
                    ) : p.cardCount === 0 ? (
                      <Chip color="danger" icon={<Icon.Card className="size-3.5" />}>
                        No cards
                      </Chip>
                    ) : (
                      <Icon.Check className="size-6 text-success" />
                    )}
                  </Panel>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          <Button variant="outline" onClick={onStopSave} icon={<Icon.Save className="size-5" />}>
            Stop &amp; Save
          </Button>
          <Button variant="outline" className="!border-danger !text-danger" onClick={onEndSession} icon={<Icon.Close className="size-5" />}>
            End Session
          </Button>
        </div>
      </div>
    </div>
  );
}

function PatternPanel({ pattern, onChange }: { pattern: WinPattern; onChange: () => void }) {
  return (
    <Panel className="flex items-center gap-3.5 p-3">
      <PatternPreview pattern={pattern} size={64} />
      <div className="min-w-0 flex-1">
        <div className="font-display text-[18px] text-burgundy">{PATTERNS[pattern].label}</div>
        <div className="text-[13.5px] text-ink-soft">{PATTERNS[pattern].description}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onChange}>
        Change
      </Button>
    </Panel>
  );
}

// -------------------------------------------------------- between rounds (caller)

function BetweenRounds({
  state,
  pattern,
  onChoosePattern,
  onStart,
  onContinue,
  onLeave,
}: {
  state: HostSnapshot;
  pattern: WinPattern;
  onChoosePattern: () => void;
  onStart: () => void;
  onContinue: () => void;
  onLeave: () => void;
}) {
  const next = state.roundsPlayed + 1;
  const paused = state.round?.status === 'paused';
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Panel className="flex flex-col items-center p-5 text-center">
        <Icon.Casino className="size-11 text-burgundy" />
        <div className="mt-1 font-display text-[24px] text-burgundy">Round {paused && state.round ? state.round.number : next}</div>
        <p className="mt-1.5 text-ink-soft">
          Players use their own paper cards. Choose the winning combination, start the round, and call the balls from this desk. The master board shows every number called.
        </p>
      </Panel>
      {paused && state.round ? (
        <Panel tone="gold">
          <div className="flex items-center gap-2 font-display text-[17px] text-burgundy">
            <Icon.Pause className="size-6" /> Round {state.round.number} is paused
          </div>
          <p className="mt-1.5 text-[15px]">
            {PATTERNS[state.round.pattern].label} · {state.called.length} numbers already called.
          </p>
          <Button full className="mt-3" onClick={onContinue} icon={<Icon.Play className="size-5" />}>
            Continue Round
          </Button>
        </Panel>
      ) : (
        <>
          <SectionTitle>Winning combination</SectionTitle>
          <PatternPanel pattern={pattern} onChange={onChoosePattern} />
          <Button size="lg" full onClick={onStart} icon={<Icon.Play className="size-5" />}>
            Start Round {next} · {PATTERNS[pattern].label}
          </Button>
        </>
      )}
      {state.roundsPlayed > 0 && (
        <>
          <SectionTitle>This session</SectionTitle>
          <p className="text-center italic text-ink-soft">
            {plural(state.roundsPlayed, 'round')} called so far. The call order and winners of every round are in History.
          </p>
        </>
      )}
      <Button variant="outline" onClick={onLeave} icon={<Icon.Door className="size-5" />}>
        Save &amp; Close or End Session
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- the desk

function DeskView({
  state,
  slot,
  onNextRound,
  onAddWinner,
  onStopSave,
  onEndSession,
}: {
  state: HostSnapshot;
  slot: Slot;
  onNextRound: () => void;
  onAddWinner: () => void;
  onStopSave: () => void;
  onEndSession: () => void;
}) {
  const r = state.round!;
  const n = state.currentNumber;
  const won = r.status === 'won';
  const waiting = state.players.length - state.players.filter((p) => !p.waiting).length;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_1fr]">
      <div className="flex flex-col items-center gap-3">
        <BallTumbler number={n} tumbling={state.drawing} size={150} />
        <div className={cx('font-display text-burgundy', n == null || state.drawing ? 'text-[16px]' : 'text-[30px]')}>
          {state.drawing ? 'Drawing...' : n == null ? 'Tap CALL NEXT to draw the first ball' : `${letterFor(n)} – ${n}`}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Chip color="burgundy" icon={<Icon.Flag className="size-3.5" />}>
            Round {r.number}
          </Chip>
          <Chip color="felt" icon={<Icon.Grid className="size-3.5" />}>
            {PATTERNS[r.pattern].label}
          </Chip>
          <Chip color="ink">{state.called.length} / 75 called</Chip>
          {slot === 'host' ? (
            <Chip color="blue" icon={<Icon.People className="size-3.5" />}>
              {state.players.filter((p) => !p.waiting).length} playing
            </Chip>
          ) : (
            <Chip color="blue" icon={<Icon.Casino className="size-3.5" />}>
              {75 - state.called.length} left in the cage
            </Chip>
          )}
          {waiting > 0 && (
            <Chip color="gold" icon={<Icon.Hourglass className="size-3.5" />}>
              {waiting} waiting for next round
            </Chip>
          )}
        </div>

        <AnimatePresence>
          {won && state.winners.length > 0 && (
            <motion.div className="w-full" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <Panel tone="gold" className="flex flex-col items-center p-4 text-center">
                <Icon.Trophy className="size-10 text-burgundy" />
                <div className="font-display text-[20px] text-burgundy">
                  {winnerNames(state.winners)} win{state.winners.length === 1 ? 's' : ''} round {r.number}!
                </div>
                {state.winners.map((w) => (
                  <div key={`${w.playerName}-${w.cardName}`} className="text-[15px]">
                    {w.playerName}: {isPaperWinner(w) ? 'paper card' : `"${w.cardName}"`} · {PATTERNS[r.pattern].label} · {w.calledCount} calls
                  </div>
                ))}
                {slot === 'host' && (
                  <p className="mt-1 text-[12.5px] italic text-ink-soft">
                    Other cards completed on the same ball are still accepted until the next round starts. Players can add cards for the next round now.
                  </p>
                )}
                <Button full className="mt-3" onClick={onNextRound} icon={<Icon.Next className="size-5" />}>
                  Start Next Round
                </Button>
                <Button variant="outline" full className="mt-2" onClick={onAddWinner} icon={<Icon.Paper className="size-5" />}>
                  {slot === 'host' ? 'Add Paper-Card Winner' : 'Add Another Winner'}
                </Button>
                <Button variant="outline" full className="mt-2" onClick={onStopSave} icon={<Icon.Save className="size-5" />}>
                  Stop &amp; Save
                </Button>
                <Button variant="ghost" className="mt-1 !text-danger" onClick={onEndSession}>
                  End Session
                </Button>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>

        {slot === 'host' && state.claims.length > 0 && (
          <div className="w-full">
            <SectionTitle>Bingo calls</SectionTitle>
            <div className="mt-2 flex flex-col gap-1.5">
              {state.claims.slice(0, 5).map((c, i) => (
                <div key={`${c.at}-${i}`} className="flex items-start gap-2.5 rounded-lg bg-cream/70 px-3 py-2">
                  {c.valid ? <Icon.Check className="mt-0.5 size-5 text-success" /> : <Icon.Close className="mt-0.5 size-5 text-danger" />}
                  <div className="min-w-0">
                    <div className="font-bold">
                      {c.playerName} · {c.cardName}
                    </div>
                    <div className="text-[13px] text-ink-soft">{c.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Recent calls</SectionTitle>
        <RecentCalls called={state.called} count={8} />
        <SectionTitle>Master board</SectionTitle>
        <Panel className="p-2.5 sm:p-3">
          <CalledBoard called={state.called} current={n} />
        </Panel>
      </div>
    </div>
  );
}

function DeskControls({
  state,
  slot,
  onCall,
  onEndRound,
  onStopSave,
  onUndo,
  onAuto,
  onInterval,
}: {
  state: HostSnapshot;
  slot: Slot;
  onCall: () => void;
  onEndRound: () => void;
  onStopSave: () => void;
  onUndo: () => void;
  onAuto: (on: boolean) => void;
  onInterval: (seconds: number) => void;
}) {
  const active = state.round?.status === 'playing';
  const remaining = 75 - state.called.length;
  const options = [...new Set([...AUTO_PRESETS, state.autoCallSeconds])].sort((a, b) => a - b);
  const canUndo = slot === 'caller' && active && !state.drawing && (state.round?.called.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-2">
      {active && (
        <>
          <Button variant="gold" size="xl" full disabled={remaining === 0 || state.drawing} onClick={onCall} icon={<Icon.Casino className="size-6" />}>
            {remaining === 0 ? 'ALL NUMBERS CALLED' : state.drawing ? 'DRAWING...' : 'CALL NEXT'}
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            {slot === 'caller' ? (
              <Button variant="outlineLight" disabled={!canUndo} onClick={onUndo} icon={<Icon.Undo className="size-5" />}>
                Undo Last
              </Button>
            ) : (
              <Button variant="outlineLight" onClick={onStopSave} icon={<Icon.Save className="size-5" />}>
                Stop &amp; Save
              </Button>
            )}
            <Button variant="outlineLight" disabled={state.drawing} onClick={onEndRound} icon={<Icon.Stop className="size-5" />}>
              End Round
            </Button>
          </div>
        </>
      )}
      <div className="flex items-center gap-2.5">
        <Switch checked={state.autoCall} disabled={!active} onChange={onAuto} label="Auto call" />
        <span>Auto every</span>
        <select
          value={state.autoCallSeconds}
          onChange={(e) => onInterval(Number(e.target.value))}
          className="rounded-lg border border-gold-light bg-burgundy-dark px-2 py-1 font-bold text-cream outline-none"
        >
          {options.map((s) => (
            <option key={s} value={s}>
              {s} seconds
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function deskSubtitle(slot: Slot): ReactNode {
  return slot === 'caller' ? 'Ball Caller' : 'Host a Game';
}
