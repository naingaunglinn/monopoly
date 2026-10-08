import { describe, expect, test } from 'vitest';
import { act, cashOf, eventsOf, fail, game, levels, own, run } from './helpers';

const MEXICO_CITY = 6;
const GUADALAJARA = 8;
const MONTERREY = 10;
const CAIRO = 12;
const ALEXANDRIA = 14;

describe('selling buildings', () => {
  test('a house refunds half the house cost (rounded to whole dollars)', () => {
    let s = levels(own(game(), [MEXICO_CITY, GUADALAJARA, MONTERREY], 0), [
      [MEXICO_CITY, 1],
      [GUADALAJARA, 1],
      [MONTERREY, 1],
    ]);
    const { state, events } = run(s, { type: 'sellBuilding', space: MEXICO_CITY });
    // House cost $45: half is $22.50, rounded to $23 (DECISIONS.md).
    expect(eventsOf(events, 'buildingSold')[0]).toMatchObject({ refund: 23, level: 0 });
    expect(cashOf(state, 0)).toBe(4023);
    s = levels(own(game(), [CAIRO, ALEXANDRIA], 0), [
      [CAIRO, 1],
      [ALEXANDRIA, 1],
    ]);
    expect(cashOf(act(s, { type: 'sellBuilding', space: CAIRO }), 0)).toBe(4025);
  });

  test('the even rule applies in reverse: sell from the highest city first', () => {
    const s = levels(own(game(), [MEXICO_CITY, GUADALAJARA, MONTERREY], 0), [
      [MEXICO_CITY, 2],
      [GUADALAJARA, 1],
      [MONTERREY, 1],
    ]);
    expect(fail(s, { type: 'sellBuilding', space: GUADALAJARA }).code).toBe('evenSell');
    const after = act(s, { type: 'sellBuilding', space: MEXICO_CITY });
    expect(after.properties[MEXICO_CITY]?.level).toBe(1);
  });

  test('a hotel refunds the house cost and leaves 4 houses', () => {
    const s = levels(own(game(), [CAIRO, ALEXANDRIA], 0), [
      [CAIRO, 5],
      [ALEXANDRIA, 5],
    ]);
    const { state, events } = run(s, { type: 'sellBuilding', space: CAIRO });
    expect(state.properties[CAIRO]?.level).toBe(4);
    expect(eventsOf(events, 'buildingSold')[0]?.refund).toBe(50);
    expect(cashOf(state, 0)).toBe(4050);
  });

  test('the landing rule does not apply to selling, but it must be your turn', () => {
    const s = levels(own(game(), [CAIRO, ALEXANDRIA], 1), [
      [CAIRO, 1],
      [ALEXANDRIA, 1],
    ]);
    // Player 1 owns them but it is player 0's turn.
    expect(fail(s, { type: 'sellBuilding', space: CAIRO }).code).toBe('notOwner');
    // Player 0 may sell on any city they own, wherever they stand, when no decision is pending.
    const mine = levels(own(game(), [CAIRO, ALEXANDRIA], 0), [
      [CAIRO, 1],
      [ALEXANDRIA, 1],
    ]);
    expect(act(mine, { type: 'sellBuilding', space: ALEXANDRIA }).properties[ALEXANDRIA]?.level).toBe(0);
    // Not while a decision is pending.
    const deciding = act(mine, { type: 'debug', op: 'setNextDice', dice: [1, 2] }, { type: 'roll' });
    expect(deciding.flow.phase).toBe('BuyDecision');
    expect(fail(deciding, { type: 'sellBuilding', space: CAIRO }).code).toBe('wrongPhase');
  });

  test('nothing to sell on an empty city', () => {
    const s = own(game(), [CAIRO, ALEXANDRIA], 0);
    expect(fail(s, { type: 'sellBuilding', space: CAIRO }).code).toBe('noBuildings');
  });
});
