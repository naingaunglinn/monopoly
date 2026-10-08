// Seeded PRNG (mulberry32). Its 32-bit state lives in state.meta.rngState, so the same seed and
// the same actions always produce the same game.
import type { GameState } from './types';

export function normalizeSeed(seed: number): number {
  return (Math.floor(Math.abs(seed)) >>> 0) || 0x9e3779b9;
}

/** One mulberry32 step: returns a float in [0, 1) and the next state. */
export function mulberry32(state: number): { value: number; next: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

/** Draws a float in [0, 1) from the state's generator, advancing it (draft states only). */
export function random(s: GameState): number {
  const { value, next } = mulberry32(s.meta.rngState);
  s.meta.rngState = next;
  return value;
}

/** Integer in [min, max]. */
export function randomInt(s: GameState, min: number, max: number): number {
  return min + Math.floor(random(s) * (max - min + 1));
}

export function rollDie(s: GameState): number {
  return randomInt(s, 1, 6);
}

/** Fisher–Yates shuffle in place. */
export function shuffleInPlace<T>(s: GameState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    const tmp = list[i] as T;
    list[i] = list[j] as T;
    list[j] = tmp;
  }
  return list;
}
