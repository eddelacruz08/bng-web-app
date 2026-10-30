'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { Profile } from '@/lib/game/types';
import { api } from './api';
import { IDENTITY_EVENT, getActiveProfileId, setActiveProfileId } from './identity';

export interface Settings {
  autoDaub: boolean;
  autoCallSeconds: number;
}

interface Cache {
  profiles: Profile[];
  settings: Settings;
  loaded: boolean;
  version: number;
}

const cache: Cache = { profiles: [], settings: { autoDaub: true, autoCallSeconds: 5 }, loaded: false, version: 0 };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit() {
  cache.version++;
  for (const l of listeners) l();
}

function subscribeCache(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function subscribeIdentity(cb: () => void) {
  window.addEventListener(IDENTITY_EVENT, cb);
  return () => window.removeEventListener(IDENTITY_EVENT, cb);
}

async function load(force = false) {
  if (cache.loaded && !force) return;
  loading ??= (async () => {
    try {
      const [p, s] = await Promise.all([
        api.get<{ profiles: Profile[] }>('/api/profiles'),
        api.get<{ settings: Record<string, string> }>('/api/settings'),
      ]);
      cache.profiles = p.profiles;
      cache.settings = {
        autoDaub: (s.settings.auto_daub ?? 'true') === 'true',
        autoCallSeconds: Math.min(30, Math.max(2, Number.parseInt(s.settings.auto_call_seconds ?? '5', 10) || 5)),
      };
      cache.loaded = true;
      emit();
    } finally {
      loading = null;
    }
  })();
  await loading;
}

/**
 * Players (profiles) and settings live on the server, shared by every browser
 * that opens this app; which profile is *active* is remembered per browser.
 */
export function useAppState() {
  useSyncExternalStore(subscribeCache, () => cache.version, () => 0);
  const activeId = useSyncExternalStore(subscribeIdentity, getActiveProfileId, () => null);

  useEffect(() => {
    void load();
  }, []);

  const profiles = cache.profiles;
  const active = profiles.find((p) => p.id === activeId) ?? null;

  const refresh = useCallback(() => load(true), []);

  const setActive = useCallback((p: Profile | null) => {
    setActiveProfileId(p?.id ?? null);
  }, []);

  const createProfile = useCallback(async (name: string, color?: string) => {
    const r = await api.post<{ profile: Profile }>('/api/profiles', { name, color });
    await load(true);
    if (!getActiveProfileId()) setActiveProfileId(r.profile.id);
    return r.profile;
  }, []);

  const updateProfile = useCallback(async (id: string, changes: { name?: string; color?: string }) => {
    await api.put(`/api/profiles/${id}`, changes);
    await load(true);
  }, []);

  const deleteProfile = useCallback(async (id: string) => {
    await api.del(`/api/profiles/${id}`);
    if (getActiveProfileId() === id) setActiveProfileId(null);
    await load(true);
  }, []);

  const setSettings = useCallback(async (changes: Partial<Settings>) => {
    const body: Record<string, string> = {};
    if (changes.autoDaub !== undefined) body.auto_daub = changes.autoDaub ? 'true' : 'false';
    if (changes.autoCallSeconds !== undefined) body.auto_call_seconds = String(changes.autoCallSeconds);
    cache.settings = { ...cache.settings, ...changes };
    emit();
    await api.put('/api/settings', body);
  }, []);

  return {
    loaded: cache.loaded,
    profiles,
    active,
    playerName: active?.name ?? 'Player',
    settings: cache.settings,
    refresh,
    setActive,
    createProfile,
    updateProfile,
    deleteProfile,
    setSettings,
  };
}

export type AppState = ReturnType<typeof useAppState>;
