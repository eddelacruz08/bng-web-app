'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

import { BingoCardView } from '@/components/BingoCardView';
import { useDialogs, useToast } from '@/components/Providers';
import { Shell } from '@/components/Shell';
import { Button, EmptyState, Icon, Spinner } from '@/components/ui';
import { api } from '@/lib/client/api';
import { useAppState } from '@/lib/client/app-state';
import { useProfileGate } from '@/lib/client/use-profile-gate';
import type { BingoCard } from '@/lib/game/card';

const MAX_SAVED = 6;

/** Saved cards for the active player; dealt automatically on joining a game. */
export default function CardsPage() {
  const app = useAppState();
  const dialogs = useDialogs();
  const toast = useToast();
  const ensureProfile = useProfileGate(app, dialogs);
  const owner = app.active?.name ?? null;
  const [cards, setCards] = useState<BingoCard[] | null>(null);

  const load = useCallback(async () => {
    if (!owner) return;
    const r = await api.get<{ cards: BingoCard[] }>(`/api/cards?owner=${encodeURIComponent(owner)}`);
    setCards(r.cards);
  }, [owner]);

  useEffect(() => {
    if (app.loaded && !app.active) void ensureProfile();
  }, [app.loaded, app.active, ensureProfile]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!owner) return;
    if ((cards?.length ?? 0) >= MAX_SAVED) return toast(`You can keep up to ${MAX_SAVED} saved cards.`, { icon: <Icon.Info /> });
    const r = await api.post<{ card: BingoCard }>('/api/cards', { owner });
    toast(`${r.card.name} created with random numbers`, { icon: <Icon.Casino /> });
    await load();
  };

  const menu = async (card: BingoCard) => {
    const choice = await dialogs.sheet({
      title: card.name,
      options: [
        { key: 'rename', label: 'Rename', icon: <Icon.Edit />, tone: 'gold' },
        { key: 'reshuffle', label: 'New random numbers', description: 'The card keeps its name but gets a fresh set of numbers.', icon: <Icon.Casino />, tone: 'burgundy' },
        { key: 'delete', label: 'Delete', description: 'Cards already used in past games stay in History.', icon: <Icon.Trash />, tone: 'danger' },
      ],
    });
    if (choice === 'rename') {
      const name = await dialogs.prompt({ title: 'Rename card', label: 'Card name', initial: card.name, maxLength: 20, validator: (v) => (v.trim() ? null : 'Enter a name.') });
      if (!name) return;
      await api.put(`/api/cards/${card.id}`, { name });
    } else if (choice === 'reshuffle') {
      const ok = await dialogs.confirm({ title: `New numbers for "${card.name}"?`, message: 'The card keeps its name but gets a fresh random set of numbers.', confirmLabel: 'Reshuffle', icon: <Icon.Casino className="size-9 text-gold" /> });
      if (!ok) return;
      await api.put(`/api/cards/${card.id}`, { reshuffle: true });
    } else if (choice === 'delete') {
      const ok = await dialogs.confirm({ title: `Delete "${card.name}"?`, message: 'The saved card is removed. Cards already used in past games stay in History.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      await api.del(`/api/cards/${card.id}`);
      toast('Card deleted', { icon: <Icon.Trash /> });
    } else return;
    await load();
  };

  return (
    <Shell
      title="My Cards"
      subtitle={owner ? `Saved for ${owner} · dealt to you in every game` : 'Pick a player first'}
      wide
      fab={
        owner ? (
          <Button variant="gold" size="lg" onClick={create} icon={<Icon.Plus className="size-5" />} className="shadow-xl">
            Create a Card
          </Button>
        ) : undefined
      }
    >
      {!owner || cards === null ? (
        <div className="flex justify-center py-24">
          <Spinner size={30} />
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Icon.Grid />}
          title="No saved cards"
          message="Tap Create a Card and a card with random numbers is made for you. Saved cards are dealt to you automatically when you join a game."
          action={
            <Button onClick={create} icon={<Icon.Plus className="size-5" />}>
              Create a Card
            </Button>
          }
        />
      ) : (
        <>
          <p className="mb-4 text-center text-[14px] italic text-ink-soft">
            You get one card per saved card when you join a lobby. The host deals fresh numbers so no two players&apos; cards look alike.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {cards.map((c) => (
                <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <BingoCardView
                    card={{ ...c, marked: [] }}
                    title={c.name}
                    trailing={
                      <button aria-label="Card options" onClick={() => menu(c)} className="-mr-1 flex size-8 items-center justify-center rounded-full text-ink-soft hover:bg-ink/8">
                        <Icon.More className="size-5" />
                      </button>
                    }
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </Shell>
  );
}
