import { describe, expect, test } from 'vitest';
import { buildBlocker, legalActions } from '../../src/engine';
import { COUNTRY_CITIES } from '../../src/data/board';
import { act, cashOf, dbg, edit, eventsOf, fail, game, levels, own, rollTo, run, spaceOf } from './helpers';

const BRASILIA = spaceOf('Brasília');
const RIO = spaceOf('Rio de Janeiro');
const CAIRO = spaceOf('Cairo');
const ALEXANDRIA = spaceOf('Alexandria');
const EGYPT = [CAIRO, ALEXANDRIA];

function landOnCairoOwningEgypt(lv: Array<[number, number]> = []) {
  return rollTo(levels(own(game(), EGYPT, 0), lv), CAIRO).state;
}

function giveVoucher(s: ReturnType<typeof game>, player: number) {
  return edit(s, (d) => {
    d.decks.chanceDeck = d.decks.chanceDeck.filter((id) => id !== 'chance-building-permit');
    d.decks.chanceDiscard = d.decks.chanceDiscard.filter((id) => id !== 'chance-building-permit');
    (d.players[player] as { houseVouchers: string[] }).houseVouchers.push('chance-building-permit');
  });
}

describe('building (the house rule: in the country you land in, D98)', () => {
  test('needs a complete country', () => {
    const s = rollTo(own(game(), CAIRO, 0), CAIRO).state;
    expect(s.flow.phase).toBe('AwaitEndTurn');
    const blocker = buildBlocker(s, 0, CAIRO);
    expect(blocker?.code).toBe('countryIncomplete');
    expect(blocker?.reason).toBe('You need every city in Egypt before building.');
  });

  test('landing on one city of a complete country offers building on every city of it', () => {
    const s = landOnCairoOwningEgypt();
    expect(s.flow.phase).toBe('BuildOffer');
    expect(s.flow.pending).toEqual({ kind: 'build', space: CAIRO });
    expect(legalActions(s)).toContainEqual({ type: 'build', space: CAIRO });
    expect(legalActions(s)).toContainEqual({ type: 'build', space: ALEXANDRIA });
    const built = act(s, { type: 'build', space: ALEXANDRIA });
    expect(built.properties[ALEXANDRIA]?.level).toBe(1);
  });

  test('needs a landing in that country this move', () => {
    const s = own(game(), EGYPT, 0);
    expect(buildBlocker(s, 0, CAIRO)?.code).toBe('notLandedHere');
    expect(fail(s, { type: 'openBuild' }).code).toBe('wrongPhase');
  });

  test('never covers another country, even one the player owns whole', () => {
    const s = rollTo(own(game(), [...EGYPT, BRASILIA, RIO], 0), CAIRO).state;
    expect(s.flow.phase).toBe('BuildOffer');
    const error = fail(s, { type: 'build', space: BRASILIA });
    expect(error.code).toBe('notLandedHere');
    expect(error.reason).toBe('You can build in Brazil only during a move that lands on one of its cities.');
    expect(legalActions(s)).not.toContainEqual({ type: 'build', space: RIO });
  });

  test('the owner’s example: with one house on each city, any of them can get a second; never two ahead', () => {
    const mexico = [...COUNTRY_CITIES.mexico] as [number, number, number];
    const [p1, p2, p3] = mexico;
    let s = rollTo(own(game(), mexico, 0), p1).state;
    expect(s.flow.phase).toBe('BuildOffer');
    // p1 has a house, p2 and p3 have none: p1 waits for them.
    s = act(s, { type: 'build', space: p1 });
    expect(fail(s, { type: 'build', space: p1 }).code).toBe('evenBuild');
    // p1 → 1, p2 → 1, p3 → 1: now any city can have a second house.
    s = act(s, { type: 'build', space: p2 }, { type: 'build', space: p3 });
    for (const space of mexico) expect(legalActions(s)).toContainEqual({ type: 'build', space });
    s = act(s, { type: 'build', space: p3 });
    expect(fail(s, { type: 'build', space: p3 }).code).toBe('evenBuild');
    expect(mexico.map((sp) => s.properties[sp]?.level)).toEqual([1, 1, 2]);
  });

  test('builds a house for the house cost', () => {
    const { state, events } = run(landOnCairoOwningEgypt(), { type: 'build', space: CAIRO });
    expect(state.properties[CAIRO]?.level).toBe(1);
    expect(cashOf(state, 0)).toBe(4000 - 50);
    expect(eventsOf(events, 'built')[0]).toMatchObject({ space: CAIRO, level: 1, cost: 50, voucher: false });
    expect(state.flow.phase).toBe('BuildOffer');
  });

  test('even rule: the spec example with Brasília at 2 and Rio at 1', () => {
    let s = levels(own(game(), [BRASILIA, RIO], 0), [
      [BRASILIA, 2],
      [RIO, 1],
    ]);
    s = rollTo(s, BRASILIA).state;
    expect(s.flow.phase).toBe('BuildOffer');
    const error = fail(s, { type: 'build', space: BRASILIA });
    expect(error.code).toBe('evenBuild');
    expect(error.reason).toBe('Your other Brazil cities must have the same number of houses first.');
  });

  test('several levels may be built in one landing while the even rule allows', () => {
    let s = landOnCairoOwningEgypt([[ALEXANDRIA, 1]]);
    s = act(s, { type: 'build', space: CAIRO }, { type: 'build', space: CAIRO });
    expect(s.properties[CAIRO]?.level).toBe(2);
    expect(fail(s, { type: 'build', space: CAIRO }).code).toBe('evenBuild');
    expect(cashOf(s, 0)).toBe(4000 - 100);
  });

  test('a fourth house', () => {
    let s = landOnCairoOwningEgypt([
      [CAIRO, 3],
      [ALEXANDRIA, 4],
    ]);
    s = act(s, { type: 'build', space: CAIRO });
    expect(s.properties[CAIRO]?.level).toBe(4);
    expect(cashOf(s, 0)).toBe(4000 - 50);
  });

  test('a hotel needs 4 houses, costs house cost × 2 and replaces the houses', () => {
    const s = landOnCairoOwningEgypt([
      [CAIRO, 4],
      [ALEXANDRIA, 4],
    ]);
    const { state, events } = run(s, { type: 'build', space: CAIRO });
    expect(state.properties[CAIRO]?.level).toBe(5);
    expect(eventsOf(events, 'built')[0]).toMatchObject({ level: 5, cost: 100 });
    expect(cashOf(state, 0)).toBe(4000 - 100);
    // One hotel at most.
    expect(fail(state, { type: 'build', space: CAIRO }).code).toBe('hasHotel');
  });

  test('a city with a hotel gets no build offer', () => {
    const s = landOnCairoOwningEgypt([
      [CAIRO, 5],
      [ALEXANDRIA, 5],
    ]);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('permission lasts until the next roll', () => {
    let s = rollTo(own(game({ auction: false }), EGYPT, 0), CAIRO, [3, 3]).state;
    expect(s.flow.phase).toBe('BuildOffer');
    s = act(s, { type: 'finishBuilding' });
    expect(s.flow.phase).toBe('AwaitRoll');
    // Still allowed before rolling again.
    expect(legalActions(s)).toContainEqual({ type: 'openBuild' });
    s = act(s, { type: 'openBuild' }, { type: 'build', space: CAIRO }, { type: 'finishBuilding' });
    expect(s.properties[CAIRO]?.level).toBe(1);
    s = act(s, { type: 'debug', op: 'setNextDice', dice: [1, 2] }, { type: 'roll' });
    expect(s.turn.landedCity).toBeNull();
    expect(buildBlocker(s, 0, CAIRO)?.code).toBe('notLandedHere');
  });

  test('permission also covers a country completed after landing', () => {
    let s = rollTo(own(game(), ALEXANDRIA, 0), CAIRO).state;
    expect(s.flow.phase).toBe('BuyDecision');
    s = act(s, { type: 'buy' });
    expect(s.flow.phase).toBe('BuildOffer');
  });

  test('a Free House card pays for the next house but not a hotel', () => {
    let s = giveVoucher(own(game(), EGYPT, 0), 0);
    s = rollTo(s, CAIRO).state;
    const { state, events } = run(s, { type: 'build', space: CAIRO });
    expect(eventsOf(events, 'built')[0]).toMatchObject({ cost: 0, voucher: true });
    expect(cashOf(state, 0)).toBe(4000);
    expect(state.players[0]?.houseVouchers).toEqual([]);
    expect(state.decks.chanceDiscard).toContain('chance-building-permit');

    let h = giveVoucher(own(game(), EGYPT, 0), 0);
    h = rollTo(levels(h, [
      [CAIRO, 4],
      [ALEXANDRIA, 4],
    ]), CAIRO).state;
    const hotel = run(h, { type: 'build', space: CAIRO });
    expect(eventsOf(hotel.events, 'built')[0]).toMatchObject({ level: 5, cost: 100, voucher: false });
    expect(hotel.state.players[0]?.houseVouchers).toEqual(['chance-building-permit']);
  });

  test('a mortgaged city in the country blocks building', () => {
    let s = dbg(own(game(), EGYPT, 0), { op: 'setMortgaged', space: ALEXANDRIA, mortgaged: true });
    s = rollTo(s, CAIRO).state;
    const error = fail(s, { type: 'build', space: CAIRO });
    expect(error.code).toBe('countryMortgaged');
    expect(error.reason).toContain('Unmortgage Alexandria');
  });

  test('building needs the cash', () => {
    let s = act(own(game(), EGYPT, 0), { type: 'debug', op: 'cash', player: 0, delta: -3960 });
    s = rollTo(s, CAIRO).state;
    expect(fail(s, { type: 'build', space: CAIRO }).code).toBe('notEnoughCash');
  });

  test('airports and companies never have buildings', () => {
    expect(buildBlocker(game(), 0, spaceOf('Brazil Airport'))?.code).toBe('notCity');
    expect(buildBlocker(game(), 0, spaceOf('Transportation Company'))?.code).toBe('notCity');
  });
});

