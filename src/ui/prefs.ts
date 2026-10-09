// Preferences that belong to this device, not to a game, kept in localStorage beside the save:
// show movement even when the device asks for reduced motion (D52), the animation speed of online
// games, which each device chooses for itself (spec section 17), and sound (spec section 18).
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
  /** Sound effects on this device. */
  soundOn: boolean;
  /** Sound effects volume, 0 to 1. */
  soundVolume: number;
  /** Voice chat volume (the others' voices), 0 to 1. */
  voiceVolume: number;
}

export const DEFAULT_VOLUME = 0.7;

const DEFAULTS: Prefs = {
  motionAnyway: false,
  onlineSpeed: 'normal',
  onlineName: '',
  soundOn: true,
  soundVolume: DEFAULT_VOLUME,
  voiceVolume: 1,
};

const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

function load(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs> | null;
    const speed = raw?.onlineSpeed;
    return {
      motionAnyway: raw?.motionAnyway === true,
      onlineSpeed: speed === 'fast' || speed === 'off' ? speed : 'normal',
      onlineName: typeof raw?.onlineName === 'string' ? raw.onlineName.slice(0, 16) : '',
      soundOn: raw?.soundOn !== false,
      soundVolume: unit(raw?.soundVolume, DEFAULT_VOLUME),
      voiceVolume: unit(raw?.voiceVolume, 1),
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

export function subscribePrefs(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
}
