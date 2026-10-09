import { describe, expect, test } from 'vitest';
import { AIRPORT_SPACES } from '../../src/data/board';
import { airportRent, ownsCountry } from '../../src/engine';
import { act, cashOf, dbg, eventsOf, fail, game, levels, own, rollTo, run, spaceOf } from './helpers';

const CAIRO = spaceOf('Cairo');
const ALEXANDRIA = spaceOf('Alexandria');
const TOKYO = spaceOf('Tokyo');
const OSAKA = spaceOf('Osaka');

describe('mortgage', () => {
  test('mortgaging pays half the price', () => {
    const { state, events } = run(own(game(), TOKYO, 0), { type: 'mortgage', space: TOKYO });
    expect(eventsOf(events, 'mortgaged')[0]?.amount).toBe(215);
    expect(cashOf(state, 0)).toBe(4215);
    expect(state.properties[TOKYO]?.mortgaged).toBe(true);
  });

  test('refused while any city in the country has buildings', () => {
    const s = levels(own(game(), [CAIRO, ALEXANDRIA], 0), [
      [CAIRO, 1],
      [ALEXANDRIA, 0],
    ]);
    const error = fail(s, { type: 'mortgage', space: ALEXANDRIA });
    expect(error.code).toBe('countryHasBuildings');
    expect(error.reason).toBe('Sell the buildings in Egypt first.');
  });

  test('a mortgaged property collects no rent', () => {
    const s = dbg(own(game(), CAIRO, 1), { op: 'setMortgaged', space: CAIRO, mortgaged: true });
    const { state, events } = rollTo(s, CAIRO);
    expect(eventsOf(events, 'noRent')).toHaveLength(1);
    expect(state.flow.phase).toBe('AwaitEndTurn');
    expect(cashOf(state, 0)).toBe(4000);
  });

  test('still counts as owned for a country and for the airport count', () => {
    let s = dbg(own(game(), [CAIRO, ALEXANDRIA], 1), { op: 'setMortgaged', space: ALEXANDRIA, mortgaged: true });
    expect(ownsCountry(s, 1, 'egypt')).toBe(true);
    const [first, second, third] = AIRPORT_SPACES as [number, number, number];
    s = own(s, [first, second, third], 1);
    s = dbg(s, { op: 'setMortgaged', space: first, mortgaged: true });
    expect(airportRent(s, third).amount).toBe(160);
  });

  test('blocks building in the country', () => {
    let s = dbg(own(game(), [TOKYO, OSAKA], 0), { op: 'setMortgaged', space: OSAKA, mortgaged: true });
    s = rollTo(s, TOKYO).state;
    expect(fail(s, { type: 'build', space: TOKYO }).code).toBe('countryMortgaged');
  });

  test('unmortgaging costs the mortgage value plus 10%, rounded up', () => {
    let s = act(own(game(), TOKYO, 0), { type: 'mortgage', space: TOKYO });
    const { state, events } = run(s, { type: 'unmortgage', space: TOKYO });
    expect(eventsOf(events, 'unmortgaged')[0]?.cost).toBe(237);
    expect(cashOf(state, 0)).toBe(4215 - 237);
    // Brasília: $70 → $35 → $38.50 → $39. United States Airport: $200 → $100 → $110.
    const [brasilia, usAirport] = [spaceOf('Brasília'), spaceOf('United States Airport')];
    s = act(own(game(), [brasilia, usAirport], 0), { type: 'mortgage', space: brasilia }, { type: 'mortgage', space: usAirport });
    const a = run(s, { type: 'unmortgage', space: brasilia });
    expect(eventsOf(a.events, 'unmortgaged')[0]?.cost).toBe(39);
    const b = run(a.state, { type: 'unmortgage', space: usAirport });
    expect(eventsOf(b.events, 'unmortgaged')[0]?.cost).toBe(110);
  });

  test('unmortgaging needs the cash and is not allowed while in debt', () => {
    let s = act(own(game(), TOKYO, 0), { type: 'mortgage', space: TOKYO });
    s = act(s, { type: 'debug', op: 'cash', player: 0, delta: -4000 });
    expect(fail(s, { type: 'unmortgage', space: TOKYO }).code).toBe('notEnoughCash');
  });

  test('cannot mortgage twice or someone else’s property', () => {
    const s = act(own(own(game(), TOKYO, 0), OSAKA, 1), { type: 'mortgage', space: TOKYO });
    expect(fail(s, { type: 'mortgage', space: TOKYO }).code).toBe('alreadyMortgaged');
    expect(fail(s, { type: 'mortgage', space: OSAKA }).code).toBe('notOwner');
    expect(fail(s, { type: 'mortgage', space: 2 }).code).toBe('notProperty');
  });
});
