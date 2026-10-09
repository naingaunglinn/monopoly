// @vitest-environment jsdom
// The primary button (spec 12) is always the next required action. With too little cash to buy a
// property, it passes, so a game never waits on a disabled button (D95).
import { describe, expect, test } from 'vitest';
import { propertyPrice } from '../../src/data/board';
import { createGame, reduce, type Action, type GameState } from '../../src/engine';
import { primarySpec } from '../../src/ui/view';

function act(s: GameState, a: Action): GameState {
  const r = reduce(s, a);
  if (r.error) throw new Error(`${a.type}: ${r.error.reason}`);
  return r.state;
}

/** Player 1 lands on Mexico City (space 6) holding `cash`. */
function landWith(cash: number, auction = true): GameState {
  let s = createGame({ playerCount: 3, passDevice: false, auction }, 5);
  s = act(s, { type: 'debug', op: 'cash', player: 0, delta: cash - (s.players[0]?.cash ?? 0) });
  s = act(s, { type: 'debug', op: 'setNextDice', dice: [2, 4] });
  return act(s, { type: 'roll' });
}

describe('the primary button on a property for sale', () => {
  test('enough cash: Buy', () => {
    const s = landWith(propertyPrice(6) + 50);
    expect(s.flow.phase).toBe('BuyDecision');
    expect(primarySpec(s)).toMatchObject({ action: { type: 'buy' }, reason: null });
  });

  test('too little cash: Pass, never a disabled Buy, and the turn goes on', () => {
    for (const auction of [true, false]) {
      let s = landWith(propertyPrice(6) - 10, auction);
      const spec = primarySpec(s);
      expect(spec).toMatchObject({ action: { type: 'decline' }, reason: null });
      s = act(s, spec?.action as Action);
      // An auction (if on) runs; folding through it reaches the end of the turn.
      while (s.flow.phase === 'Auction') s = act(s, { type: 'fold' });
      expect(s.flow.phase).toBe('AwaitEndTurn');
      expect(primarySpec(s)?.action.type).toBe('endTurn');
    }
  });
});
