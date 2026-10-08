// What the board shows right now. Game state is always final; this layer lets the interface play
// the events of the last action (token steps, counting cash, dice) and finish them on any input.
// Components read positions, cash and dice from here instead of from the game state.
import { useSyncExternalStore } from 'react';
import type { Dice, GameState } from '../engine';

export interface DisplayState {
  /** Token position per player while an animation runs; null = use the game state. */
  positions: number[] | null;
  /** Shown cash per player while counting; null = use the game state. */
  cash: number[] | null;
  dice: Dice | null;
  /** True while events are being played; decision panels wait for it. */
  busy: boolean;
}

type Listener = () => void;
let state: DisplayState = { positions: null, cash: null, dice: null, busy: false };
const listeners = new Set<Listener>();

export function getDisplay(): DisplayState {
  return state;
}

export function setDisplay(patch: Partial<DisplayState>): void {
  state = { ...state, ...patch };
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
  return d.busy ? d.dice : s.turn.dice;
}
