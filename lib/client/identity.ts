'use client';

import { newId } from '@/lib/game/ids';

const CLIENT_KEY = 'cb.clientId';
const PROFILE_KEY = 'cb.activeProfile';
export const IDENTITY_EVENT = 'cb:identity';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new Event(IDENTITY_EVENT));
}

/** Stable id for this browser, so a reconnecting player replaces its old socket. */
export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = read(CLIENT_KEY);
  if (!id) {
    id = newId('w');
    write(CLIENT_KEY, id);
  }
  return id;
}

export function getActiveProfileId(): string | null {
  if (typeof window === 'undefined') return null;
  return read(PROFILE_KEY);
}

export function setActiveProfileId(id: string | null) {
  write(PROFILE_KEY, id);
}
