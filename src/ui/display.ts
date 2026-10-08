// What the board shows right now. Game state is always final; this layer lets the interface play
// the events of the last action (token steps, counting cash, dice, highlights) and finish them on
// any input. Components read positions, cash and dice from here instead of from the game state.
import { useSyncExternalStore } from 'react';
import type { Dice, GameState } from '../engine';

export interface FloatAmount {
  id: number;
  player: number;
  amount: number;
}

export interface DisplayState {
  /** True while events are being played; decision panels wait for it. */
  busy: boolean;
  /** Token position per player while an animation runs; null = use the game state. */
  positions: number[] | null;
  /** Per-player transition length (ms) for the current token move. */
  moveMs: number[] | null;
  /** Shown cash per player while counting; null = use the game state. */
  cash: number[] | null;
  /** Dice faces while the dice tumble. */
  dice: Dice | null;
  rolling: boolean;
  /** Path tiles that light briefly as a token passes. */
  lit: number[];
  /** Landing glow. */
  glow: number | null;
  /** World Start flash. */
  flash: number | null;
  /** "Bought" stamp. */
  stamp: { space: number; id: number } | null;
  /** Signed amounts floating beside player cards. */
  floats: FloatAmount[];
  /** A coin travelling from payer to owner. */
  coin: { from: number; to: number; id: number } | null;
  /** The newest building pip to animate. */
  pip: { space: number; hotel: boolean; id: number } | null;
  /** The player whose turn just started (one pulse). */
  pulse: { player: number; id: number } | null;
  /** Winner confetti burst. */
  confetti: number | null;
}

export const IDLE: DisplayState = {
  busy: false,
  positions: null,
  moveMs: null,
  cash: null,
  dice: null,
  rolling: false,
  lit: [],
  glow: null,
  flash: null,
  stamp: null,
  floats: [],
  coin: null,
  pip: null,
  pulse: null,
  confetti: null,
};

type Listener = () => void;
let state: DisplayState = IDLE;
const listeners = new Set<Listener>();

export function getDisplay(): DisplayState {
  return state;
}

export function setDisplay(patch: Partial<DisplayState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function resetDisplay(keep: Partial<DisplayState> = {}): void {
  state = { ...IDLE, ...keep };
  for (const l of listeners) l();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDisplay(): DisplayState {
  return useSyncExternalStore(subscribe, getDisplay, getDisplay);
}

export function shownPosition(s: GameState, d: DisplayState, player: number): number {
  return d.positions?.[player] ?? s.players[player]?.position ?? 0;
}

export function shownCash(s: GameState, d: DisplayState, player: number): number {
  return d.cash?.[player] ?? s.players[player]?.cash ?? 0;
}

export function shownDice(s: GameState, d: DisplayState): Dice | null {
  return d.busy && d.dice ? d.dice : s.turn.dice;
}
