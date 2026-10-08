import { describe, expect, test } from 'vitest';
import { act, at, cashOf, eventsOf, forceCard, game, rollWith, run } from './helpers';

describe('movement', () => {
  test('a normal move goes clockwise one space at a time', () => {
    const s = game();
    const { state, events } = rollWith(s, 4, 5);
    expect(state.players[0]?.position).toBe(9);
    const moved = eventsOf(events, 'moved')[0];
    expect(moved?.path).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(moved?.direction).toBe(1);
    expect(state.flow.phase).toBe('BuyDecision');
  });

  test('wraps from 79 to 0 and landing on World Start pays $500 once', () => {
    const s = at(game(), 0, 77);
    const { state, events } = rollWith(s, 1, 2);
    expect(state.players[0]?.position).toBe(0);
    expect(cashOf(state, 0)).toBe(4000 + 500);
    expect(eventsOf(events, 'passedStart')).toHaveLength(1);
    expect(eventsOf(events, 'moved')[0]?.path).toEqual([78, 79, 0]);
    expect(state.flow.phase).toBe('AwaitEndTurn');
  });

  test('passing World Start pays $500', () => {
    const { state } = rollWith(at(game(), 0, 76), 3, 4);
    expect(state.players[0]?.position).toBe(3);
    expect(cashOf(state, 0)).toBe(4500);
  });

  test('a backward move pays nothing, even across World Start', () => {
    // Land on Chance (2) from 75: passing World Start pays once.
    let s = forceCard(at(game(), 0, 75), 'chance-forgot-passport');
    s = rollWith(s, 3, 4).state;
    expect(s.flow.phase).toBe('CardReveal');
    expect(cashOf(s, 0)).toBe(4500);
    const { state, events } = run(s, { type: 'confirmCard' });
    expect(eventsOf(events, 'moved')[0]).toMatchObject({ direction: -1, path: [1, 0, 79], to: 79 });
    expect(eventsOf(events, 'passedStart')).toHaveLength(0);
    expect(state.players[0]?.position).toBe(79);
    expect(cashOf(state, 0)).toBe(4500);
  });

  test('moving backward onto World Start pays nothing', () => {
    let s = forceCard(at(game(), 0, 75), 'chance-wrong-exit');
    s = rollWith(s, 3, 4).state;
    s = act(s, { type: 'confirmCard' });
    expect(s.players[0]?.position).toBe(0);
    expect(cashOf(s, 0)).toBe(4500);
  });

  test('forward card movement past World Start pays $500', () => {
    let s = forceCard(at(game(), 0, 63), 'chance-carnival');
    s = rollWith(s, 3, 4).state; // Chance at 70
    s = act(s, { type: 'confirmCard' });
    expect(s.players[0]?.position).toBe(1);
    expect(cashOf(s, 0)).toBe(4500);
    expect(s.flow.phase).toBe('BuyDecision');
  });

  test('doubles grant another roll; three doubles send the player to Jail without moving', () => {
    let s = game({ auction: false });
    s = rollWith(s, 2, 2).state; // 4: Brazil Airport
    expect(s.flow.phase).toBe('BuyDecision');
    s = act(s, { type: 'decline' });
    expect(s.flow.phase).toBe('AwaitRoll');
    s = rollWith(s, 3, 3).state; // 10: Monterrey
    s = act(s, { type: 'decline' });
    expect(s.flow.phase).toBe('AwaitRoll');
    expect(s.turn.doublesCount).toBe(2);
    const third = rollWith(s, 5, 5);
    expect(eventsOf(third.events, 'moved')).toHaveLength(0);
    expect(third.state.players[0]?.position).toBe(17);
    expect(third.state.players[0]?.inJail).toBe(true);
    expect(third.state.flow.phase).toBe('AwaitEndTurn');
    expect(eventsOf(third.events, 'jailed')[0]?.reason).toBe('doubles');
    // Going to Jail collects no World Start money.
    expect(cashOf(third.state, 0)).toBe(4000);
  });

  test('the doubles counter resets when the turn ends', () => {
    let s = game({ auction: false });
    s = rollWith(s, 2, 2).state; // 4
    s = act(s, { type: 'decline' });
    s = rollWith(s, 2, 3).state; // 9: Mexico Airport
    s = act(s, { type: 'decline' });
    expect(s.turn.doublesCount).toBe(1);
    expect(s.flow.phase).toBe('AwaitEndTurn');
    s = act(s, { type: 'endTurn' });
    expect(s.turn.doublesCount).toBe(0);
    expect(s.turn.currentPlayerIndex).toBe(1);
  });
});
