import { describe, expect, test } from 'vitest';
import { cityRent, ownsCountry } from '../../src/engine';
import { act, cashOf, dbg, fail, game, levels, own, rollTo, setCash } from './helpers';

const CAIRO = 12;
const ALEXANDRIA = 14;
const MEXICO_AIRPORT = 9;

describe('buying', () => {
  test('Buy pays the price to the bank and takes ownership', () => {
    let s = rollTo(game(), MEXICO_AIRPORT).state;
    expect(s.flow.phase).toBe('BuyDecision');
    s = act(s, { type: 'buy' });
    expect(s.properties[MEXICO_AIRPORT]?.owner).toBe(0);
    expect(cashOf(s, 0)).toBe(4000 - 110);
    expect(cashOf(s, 1)).toBe(4000);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('Pass starts an auction when auctions are on', () => {
    const s = act(rollTo(game(), MEXICO_AIRPORT).state, { type: 'decline' });
    expect(s.flow.phase).toBe('Auction');
  });

  test('Pass leaves the property unowned when auctions are off', () => {
    const s = act(rollTo(game({ auction: false }), MEXICO_AIRPORT).state, { type: 'decline' });
    expect(s.properties[MEXICO_AIRPORT]?.owner).toBeNull();
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('Buy is refused without enough cash and says why', () => {
    const s = rollTo(setCash(game(), 0, 50), MEXICO_AIRPORT).state;
    const error = fail(s, { type: 'buy' });
    expect(error.code).toBe('notEnoughCash');
    expect(error.reason).toContain("You don't have enough money");
    // The player can still pass (and bid in the auction).
    expect(act(s, { type: 'decline' }).flow.phase).toBe('Auction');
  });
});

describe('rent', () => {
  test('a city in an incomplete country charges base rent', () => {
    let s = own(game(), CAIRO, 1);
    s = rollTo(s, CAIRO).state;
    expect(s.flow.phase).toBe('RentDue');
    expect(s.flow.pending?.kind === 'rent' && s.flow.pending.rent.amount).toBe(17);
    s = act(s, { type: 'payRent' });
    expect(cashOf(s, 0)).toBe(4000 - 17);
    expect(cashOf(s, 1)).toBe(4000 + 17);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('a complete country doubles empty-city rent and follows the building table', () => {
    let s = own(game(), [CAIRO, ALEXANDRIA], 1);
    expect(ownsCountry(s, 1, 'egypt')).toBe(true);
    expect(cityRent(s, CAIRO).amount).toBe(34);
    const expected = [34, 68, 119, 187, 255, 340];
    for (let level = 1; level <= 5; level++) {
      s = levels(s, [
        [CAIRO, level],
        [ALEXANDRIA, level],
      ]);
      expect(cityRent(s, CAIRO).amount).toBe(expected[level]);
    }
    s = rollTo(s, CAIRO).state;
    expect(s.flow.pending?.kind === 'rent' && s.flow.pending.rent.amount).toBe(340);
  });

  test('a mortgaged city still counts toward a complete country', () => {
    let s = own(game(), [CAIRO, ALEXANDRIA], 1);
    s = dbg(s, { op: 'setMortgaged', space: ALEXANDRIA, mortgaged: true });
    expect(ownsCountry(s, 1, 'egypt')).toBe(true);
    expect(cityRent(s, CAIRO).amount).toBe(34);
  });

  test('landing on your own property costs nothing', () => {
    let s = own(game(), CAIRO, 0);
    s = rollTo(s, CAIRO).state;
    expect(cashOf(s, 0)).toBe(4000);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('owners collect rent while in Jail', () => {
    let s = own(game(), CAIRO, 1);
    s = { ...s, players: s.players.map((p) => (p.id === 1 ? { ...p, inJail: true, position: 17 } : p)) };
    s = act(rollTo(s, CAIRO).state, { type: 'payRent' });
    expect(cashOf(s, 1)).toBe(4017);
  });
});
