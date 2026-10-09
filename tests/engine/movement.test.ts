import { describe, expect, test } from 'vitest';
import { BOARD_SIZE } from '../../src/data/balance';
import { isProperty, SPACES } from '../../src/data/board';
import { act, at, cashOf, eventsOf, forceCard, game, rollWith, run, spacesOf } from './helpers';

const N = BOARD_SIZE;

describe('movement', () => {
  test('a normal move goes clockwise one space at a time', () => {
    // A plain roll of 9 or less onto a property.
    const [a, b] = ([[4, 5], [3, 5], [3, 4], [2, 4], [2, 3], [1, 3]] as const).find(([x, y]) => isProperty(x + y)) as readonly [number, number];
    const s = game();
    const { state, events } = rollWith(s, a, b);
    expect(state.players[0]?.position).toBe(a + b);
    const moved = eventsOf(events, 'moved')[0];
    expect(moved?.path).toEqual(Array.from({ length: a + b }, (_, i) => i + 1));
    expect(moved?.direction).toBe(1);
    expect(state.flow.phase).toBe('BuyDecision');
  });

  test('wraps from the last space to 0 and landing on World Start pays $500 once', () => {
    const s = at(game(), 0, N - 3);
    const { state, events } = rollWith(s, 1, 2);
    expect(state.players[0]?.position).toBe(0);
    expect(cashOf(state, 0)).toBe(4000 + 500);
    expect(eventsOf(events, 'passedStart')).toHaveLength(1);
    expect(eventsOf(events, 'moved')[0]?.path).toEqual([N - 2, N - 1, 0]);
    expect(state.flow.phase).toBe('AwaitEndTurn');
  });

  test('passing World Start pays $500', () => {
    const { state } = rollWith(at(game(), 0, N - 4), 3, 4);
    expect(state.players[0]?.position).toBe(3);
    expect(cashOf(state, 0)).toBe(4500);
  });

  test('a backward move pays nothing, even across World Start', () => {
    // Land on Chance (2) from 5 before the end: passing World Start pays once.
    let s = forceCard(at(game(), 0, N - 5), 'chance-forgot-passport');
    s = rollWith(s, 3, 4).state;
    expect(s.flow.phase).toBe('CardReveal');
    expect(cashOf(s, 0)).toBe(4500);
    const { state, events } = run(s, { type: 'confirmCard' });
    expect(eventsOf(events, 'moved')[0]).toMatchObject({ direction: -1, path: [1, 0, N - 1], to: N - 1 });
    expect(eventsOf(events, 'passedStart')).toHaveLength(0);
    expect(state.players[0]?.position).toBe(N - 1);
    expect(cashOf(state, 0)).toBe(4500);
  });

  test('moving backward onto World Start pays nothing', () => {
    let s = forceCard(at(game(), 0, N - 5), 'chance-wrong-exit');
    s = rollWith(s, 3, 4).state;
    s = act(s, { type: 'confirmCard' });
    expect(s.players[0]?.position).toBe(0);
    expect(cashOf(s, 0)).toBe(4500);
  });

  test('forward card movement past World Start pays $500', () => {
    const lastChance = spacesOf('chance').at(-1) as number;
    let s = forceCard(at(game(), 0, lastChance - 7), 'chance-carnival');
    s = rollWith(s, 3, 4).state; // the last Chance
    s = act(s, { type: 'confirmCard' });
    expect(s.players[0]?.position).toBe(1);
    expect(cashOf(s, 0)).toBe(4500);
    expect(s.flow.phase).toBe('BuyDecision');
  });

  test('doubles grant another roll; three doubles send the player to Jail without moving', () => {
    // Two doubles that land on properties: from 0, then on from there.
    const first = [1, 2, 3, 4, 5, 6].find((d) => isProperty(2 * d)) as number;
    const second = [1, 2, 3, 4, 5, 6].find((d) => isProperty(2 * first + 2 * d)) as number;
    let s = game({ auction: false });
    s = rollWith(s, first, first).state;
    expect(s.flow.phase).toBe('BuyDecision');
    s = act(s, { type: 'decline' });
    expect(s.flow.phase).toBe('AwaitRoll');
    s = rollWith(s, second, second).state;
    s = act(s, { type: 'decline' });
    expect(s.flow.phase).toBe('AwaitRoll');
    expect(s.turn.doublesCount).toBe(2);
    const third = rollWith(s, 5, 5);
    expect(eventsOf(third.events, 'moved')).toHaveLength(0);
    expect(third.state.players[0]?.position).toBe(SPACES.jail);
    expect(third.state.players[0]?.inJail).toBe(true);
    expect(third.state.flow.phase).toBe('AwaitEndTurn');
    expect(eventsOf(third.events, 'jailed')[0]?.reason).toBe('doubles');
    // Going to Jail collects no World Start money.
    expect(cashOf(third.state, 0)).toBe(4000);
  });

  test('the doubles counter resets when the turn ends', () => {
    // Doubles onto a property, then a plain roll onto another.
    const d = [1, 2, 3, 4, 5, 6].find((n) => isProperty(2 * n)) as number;
    const [a, b] = ([[1, 2], [1, 3], [2, 3], [1, 4], [2, 4], [1, 5], [2, 5], [3, 4]] as const).find(([x, y]) => isProperty(2 * d + x + y)) as readonly [number, number];
    let s = game({ auction: false });
    s = rollWith(s, d, d).state;
    s = act(s, { type: 'decline' });
    s = rollWith(s, a, b).state;
    s = act(s, { type: 'decline' });
    expect(s.turn.doublesCount).toBe(1);
    expect(s.flow.phase).toBe('AwaitEndTurn');
    s = act(s, { type: 'endTurn' });
    expect(s.turn.doublesCount).toBe(0);
    expect(s.turn.currentPlayerIndex).toBe(1);
  });
});
