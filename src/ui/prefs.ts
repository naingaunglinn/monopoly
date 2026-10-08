// Preferences that belong to this device, not to a game, kept in localStorage beside the save:
// show movement even when the device asks for reduced motion (D52), and the animation speed of
// online games, which each device chooses for itself (spec section 17).
import { useSyncExternalStore } from 'react';
import type { AnimationSpeed } from '../engine';

export const PREFS_KEY = 'global-monopoly/prefs/v1';

export interface Prefs {
  /** Play token movement and effects even with prefers-reduced-motion. */
  motionAnyway: boolean;
  /** Animation speed in online games on this device. */
  onlineSpeed: AnimationSpeed;
  /** The name last used to create or join a room on this device. */
  onlineName: string;
}

const DEFAULTS: Prefs = { motionAnyway: false, onlineSpeed: 'normal', onlineName: '' };

function load(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs> | null;
    const speed = raw?.onlineSpeed;
    return {
      motionAnyway: raw?.motionAnyway === true,
      onlineSpeed: speed === 'fast' || speed === 'off' ? speed : 'normal',
      onlineName: typeof raw?.onlineName === 'string' ? raw.onlineName.slice(0, 16) : '',
    };
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
