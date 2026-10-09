// Test helpers: drive the real reducer (including its debug actions) and check invariants after
// every step.
import { expect } from 'vitest';
import {
  checkInvariants,
  createGame,
  reduce,
  type Action,
  type DebugOp,
  type EngineError,
  type GameEvent,
  type GameState,
  type Settings,
} from '../../src/engine';
import { cloneState } from '../../src/engine/core';
import { BOARD_SIZE } from '../../src/data/balance';
import { BOARD, PROPERTY_SPACES, propertyName, type SpaceType } from '../../src/data/board';

/** The index of the city, airport or company with this name on the board in play. */
export function spaceOf(name: string): number {
  const space = PROPERTY_SPACES.find((sp) => propertyName(sp) === name);
  if (space === undefined) throw new Error(`No space named ${name} on this board`);
  return space;
}

/** The spaces of this type on the board in play, clockwise from World Start. */
export function spacesOf(type: SpaceType): number[] {
  return BOARD.filter((s) => s.type === type).map((s) => s.index);
}

/** The first space of this type on the board in play. */
export function firstOf(type: SpaceType): number {
  const space = spacesOf(type)[0];
  if (space === undefined) throw new Error(`No ${type} space on this board`);
  return space;
}

export function game(settings: Partial<Settings> = {}, seed = 7): GameState {
  return createGame({ passDevice: false, ...settings }, seed);
}

export function run(s: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const r = reduce(s, action);
  if (r.error) throw new Error(`${action.type} failed: ${r.error.reason}`);
  const broken = checkInvariants(r.state);
  if (broken.length > 0) throw new Error(`invariants broken after ${action.type}: ${broken.join('; ')}`);
  return { state: r.state, events: r.events };
}

export function act(s: GameState, ...actions: Action[]): GameState {
  let state = s;
  for (const a of actions) state = run(state, a).state;
  return state;
}

/** Expects the action to be refused and the state to be untouched. */
export function fail(s: GameState, action: Action): EngineError {
  const r = reduce(s, action);
  expect(r.error).not.toBeNull();
  expect(r.state).toBe(s);
  expect(r.events).toEqual([]);
  return r.error as EngineError;
}

export function dbg(s: GameState, op: DebugOp): GameState {
  return act(s, { type: 'debug', ...op } as Action);
}

export function own(s: GameState, spaces: number | number[], owner: number | null): GameState {
  let state = s;
  for (const space of Array.isArray(spaces) ? spaces : [spaces]) state = dbg(state, { op: 'setOwner', space, owner });
  return state;
}

/** Sets building levels in one step (the even rule is only checked on the final state). */
export function levels(s: GameState, entries: Array<[number, number]>): GameState {
  return edit(s, (d) => {
    for (const [space, level] of entries) {
      const ps = d.properties[space];
      if (!ps) throw new Error(`no property at ${space}`);
      ps.level = level;
    }
  });
}

export function setCash(s: GameState, player: number, amount: number): GameState {
  return dbg(s, { op: 'cash', player, delta: amount - (s.players[player]?.cash ?? 0) });
}

export function at(s: GameState, player: number, space: number): GameState {
  return dbg(s, { op: 'movePlayer', player, space });
}

export function nextDice(s: GameState, a: number, b: number): GameState {
  return dbg(s, { op: 'setNextDice', dice: [a, b] });
}

export function forceCard(s: GameState, cardId: string): GameState {
  const deck = cardId.startsWith('chance-') ? 'chance' : 'event';
  return dbg(s, { op: 'forceCard', deck, cardId });
}

/** Rolls the given dice for the current player (phase must be AwaitRoll). */
export function rollWith(s: GameState, a: number, b: number): { state: GameState; events: GameEvent[] } {
  return run(nextDice(s, a, b), { type: 'roll' });
}

/**
 * Puts the current player `steps` before `target` and rolls exactly onto it. The default dice
 * (3 and 4, or less for a target near World Start) never pass World Start when they can avoid it.
 */
export function rollTo(
  s: GameState,
  target: number,
  dice: [number, number] = target >= 7 ? [3, 4] : target >= 3 ? [1, target - 1] : [3, 4],
): { state: GameState; events: GameEvent[] } {
  const steps = dice[0] + dice[1];
  const from = (target - steps + BOARD_SIZE) % BOARD_SIZE;
  return rollWith(at(s, s.turn.currentPlayerIndex, from), dice[0], dice[1]);
}

/** Directly edits a copy of the state (for setups the debug actions do not cover). */
export function edit(s: GameState, fn: (draft: GameState) => void): GameState {
  const draft = cloneState(s);
  fn(draft);
  const broken = checkInvariants(draft);
  if (broken.length > 0) throw new Error(`invalid test setup: ${broken.join('; ')}`);
  return draft;
}

export function cashOf(s: GameState, player: number): number {
  return s.players[player]?.cash ?? NaN;
}

export function totalCash(s: GameState): number {
  return s.players.reduce((sum, p) => sum + p.cash, 0);
}

export function eventsOf<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** Acknowledges notices, closes build offers and ends the turn of the current player. */
export function endTurn(s: GameState): GameState {
  let state = s;
  for (let guard = 0; guard < 20; guard++) {
    if (state.flow.notices.length > 0) state = act(state, { type: 'acknowledge' });
    else if (state.flow.phase === 'BuildOffer') state = act(state, { type: 'finishBuilding' });
    else if (state.flow.phase === 'AwaitEndTurn') return act(state, { type: 'endTurn' });
    else throw new Error(`cannot end turn from ${state.flow.phase}`);
  }
  throw new Error('endTurn did not finish');
}
