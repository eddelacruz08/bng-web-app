'use client';

import { useState } from 'react';

import { useDialogs, useToast } from '@/components/Providers';
import { Shell } from '@/components/Shell';
import { Avatar, Button, Icon, Panel, SectionTitle, Switch, TextField, cx } from '@/components/ui';
import { useAppState } from '@/lib/client/app-state';
import { PROFILE_PALETTE, type Profile } from '@/lib/game/types';

/** Player profiles (shared by every browser on this server) and game settings. */
export default function SettingsPage() {
  const app = useAppState();
  const dialogs = useDialogs();
  const toast = useToast();

  const edit = async (existing?: Profile) => {
    const result = await dialogs.custom<{ name: string; color: string }>((close) => (
      <ProfileDialog
        existing={existing}
        taken={app.profiles.filter((p) => p.id !== existing?.id).map((p) => p.name.toLowerCase())}
        defaultColor={PROFILE_PALETTE[app.profiles.length % PROFILE_PALETTE.length]}
        onClose={close}
      />
    ));
    if (!result) return;
    try {
      if (existing) await app.updateProfile(existing.id, result);
      else await app.createProfile(result.name, result.color); // becomes active only when nobody is yet
      toast(existing ? 'Player updated' : 'Player added', { icon: <Icon.Check /> });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: 'danger', icon: <Icon.Info /> });
    }
  };

  const remove = async (p: Profile) => {
    const ok = await dialogs.confirm({
      title: `Delete ${p.name}?`,
      message: 'Saved cards and history stay, but they will no longer be linked to an active player name.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await app.deleteProfile(p.id);
    toast('Player deleted', { icon: <Icon.Trash /> });
  };

  const menu = async (p: Profile) => {
    const choice = await dialogs.sheet({
      title: p.name,
      options: [
        { key: 'edit', label: 'Edit', icon: <Icon.Edit />, tone: 'gold' },
        { key: 'delete', label: 'Delete', icon: <Icon.Trash />, tone: 'danger' },
      ],
    });
    if (choice === 'edit') await edit(p);
    else if (choice === 'delete') await remove(p);
  };

  return (
    <Shell
      title="Players & Settings"
      fab={
        <Button variant="gold" size="lg" onClick={() => edit()} icon={<Icon.Plus className="size-5" />} className="shadow-xl">
          Add Player
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <SectionTitle>Players on this server</SectionTitle>
        {app.profiles.length === 0 && <p className="text-center italic text-ink-soft">No players yet. Add one to host or join games.</p>}
        <div className="flex flex-col gap-2">
          {app.profiles.map((p) => {
            const active = app.active?.id === p.id;
            return (
              <Panel key={p.id} className="flex items-center gap-3 py-2.5 pl-3.5 pr-1.5">
                <button onClick={() => app.setActive(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={p.name} color={p.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{p.name}</span>
                    <span className="block text-[13px] text-ink-soft">{active ? 'Active player on this device' : 'Tap to make active on this device'}</span>
                  </span>
                  {active && <Icon.Check className="size-6 text-success" />}
                </button>
                <button aria-label="Options" onClick={() => menu(p)} className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-ink/8">
                  <Icon.More className="size-5" />
                </button>
              </Panel>
            );
          })}
        </div>

        <SectionTitle>Game settings</SectionTitle>
        <Panel className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="font-bold">Auto-daub by default</div>
              <div className="text-[13.5px] text-ink-soft">Called numbers are marked on your cards automatically.</div>
            </div>
            <Switch checked={app.settings.autoDaub} onChange={(v) => app.setSettings({ autoDaub: v })} label="Auto-daub" />
          </div>
          <div className="h-px bg-gold/50" />
          <div>
            <div className="font-bold">Auto-call interval (host)</div>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={2}
                max={30}
                value={app.settings.autoCallSeconds}
                onChange={(e) => app.setSettings({ autoCallSeconds: Number(e.target.value) })}
                className="flex-1 accent-burgundy"
              />
              <span className="w-11 text-right font-display text-burgundy">{app.settings.autoCallSeconds}s</span>
            </div>
            <div className="text-[13px] text-ink-soft">How often the caller draws a ball when auto-call is on.</div>
          </div>
        </Panel>

        <SectionTitle>About</SectionTitle>
        <Panel>
          <p className="text-ink-soft">
            Classic Bingo plays over the local network with no internet. A lobby hosted here speaks the same protocol as the Classic Bingo phone app, so phones and browsers play together.
            Games, rounds and cards are stored as JSON files in this project&apos;s <code className="rounded bg-parchment-dark px-1">data/</code> folder.
          </p>
        </Panel>
        <div className="h-16" />
      </div>
    </Shell>
  );
}

function ProfileDialog({
  existing,
  taken,
  defaultColor,
  onClose,
}: {
  existing?: Profile;
  taken: string[];
  defaultColor: string;
  onClose: (v: { name: string; color: string } | null) => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? defaultColor);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const n = name.trim();
    if (n.length < 2) return setError('Enter at least 2 letters.');
    if (taken.includes(n.toLowerCase())) return setError('That name is already used.');
    onClose({ name: n, color });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="text-center font-display text-[20px] text-burgundy">{existing ? 'Edit player' : 'New player'}</h2>
      <div className="mt-3">
        <TextField
          label="Name"
          value={name}
          autoFocus
          maxLength={20}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error}
        />
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {PROFILE_PALETTE.map((c) => (
          <button
            type="button"
            key={c}
            aria-label={`Colour ${c}`}
            onClick={() => setColor(c)}
            className={cx('flex size-9 items-center justify-center rounded-full border-[3px] transition-transform', color === c ? 'scale-110 border-gold' : 'border-transparent')}
            style={{ background: c }}
          >
            {color === c && <Icon.Check className="size-4 text-cream" />}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <Button type="button" variant="ghost" onClick={() => onClose(null)}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
