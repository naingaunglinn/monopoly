// Preferences that belong to this device, not to a game, kept in localStorage beside the save.
// Today there is one: show movement even when the device asks for reduced motion (D52).
import { useSyncExternalStore } from 'react';

export const PREFS_KEY = 'global-monopoly/prefs/v1';

export interface Prefs {
  /** Play token movement and effects even with prefers-reduced-motion. */
  motionAnyway: boolean;
}

const DEFAULTS: Prefs = { motionAnyway: false };

function load(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs> | null;
    return { motionAnyway: raw?.motionAnyway === true };
  } catch {
    return { ...DEFAULTS };
  }
}

let prefs: Prefs = typeof window === 'undefined' ? { ...DEFAULTS } : load();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the preference lasts until the page closes.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}
