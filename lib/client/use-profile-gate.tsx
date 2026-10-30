'use client';

import { useCallback } from 'react';

import type { AppState } from './app-state';
import type { useDialogs } from '@/components/Providers';
import type { Profile } from '@/lib/game/types';

/** Makes sure a player is picked before hosting or joining; asks for one if not. Resolves to the active profile. */
export function useProfileGate(app: AppState, dialogs: ReturnType<typeof useDialogs>) {
  return useCallback(async (): Promise<Profile | null> => {
    if (app.active) return app.active;
    if (app.profiles.length > 0) {
      // Players exist on this server but none is picked in this browser yet.
      const picked = await dialogs.custom<string>(
        (close) => (
          <div className="px-2 pt-3">
            <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-gold" />
            <h2 className="px-3 pb-1 text-center font-display text-[18px] text-burgundy">Who is playing on this device?</h2>
            <div className="flex flex-col">
              {app.profiles.map((p) => (
                <button key={p.id} onClick={() => close(p.id)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-burgundy/6">
                  <span className="flex size-10 items-center justify-center rounded-full border-2 border-gold font-display text-cream" style={{ background: p.color }}>
                    {p.name[0]?.toUpperCase()}
                  </span>
                  <span className="text-[16px] font-bold text-ink">{p.name}</span>
                </button>
              ))}
              <button onClick={() => close('__new__')} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-burgundy/6">
                <span className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-gold text-burgundy">+</span>
                <span className="text-[16px] font-bold text-burgundy">Someone new</span>
              </button>
            </div>
          </div>
        ),
        { sheet: true },
      );
      if (!picked) return null;
      if (picked !== '__new__') {
        const p = app.profiles.find((x) => x.id === picked);
        if (p) {
          app.setActive(p);
          return p;
        }
      }
    }
    const name = await dialogs.prompt({
      title: 'What should we call you?',
      label: 'Your name',
      confirmLabel: 'Continue',
      maxLength: 20,
      validator: (v) => (v.trim().length < 2 ? 'Enter at least 2 letters.' : null),
    });
    if (!name) return null;
    try {
      const p = await app.createProfile(name);
      app.setActive(p);
      return p;
    } catch (e) {
      await dialogs.info({ title: 'Could not add player', message: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }, [app, dialogs]);
}
