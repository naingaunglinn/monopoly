import { describe, expect, test } from 'vitest';
import { AIRPORT_SPACES } from '../../src/data/board';
import { airportRent } from '../../src/engine';
import { act, cashOf, eventsOf, fail, game, nextDice, own, rollTo, run, spaceOf } from './helpers';

const AIRPORTS = [...AIRPORT_SPACES];
const EGYPT_AIRPORT = spaceOf('Egypt Airport');
const TRANSPORT = spaceOf('Transportation Company');

describe('airports', () => {
  test('buy an airport', () => {
    const s = act(rollTo(game(), EGYPT_AIRPORT).state, { type: 'buy' });
    expect(s.properties[EGYPT_AIRPORT]?.owner).toBe(0);
    expect(cashOf(s, 0)).toBe(3880);
  });

  test('rent for 1 to 10 airports owned', () => {
    const ladder = [40, 90, 160, 250, 350, 475, 625, 800, 1000, 1250];
    let s = game();
    const order = [EGYPT_AIRPORT, ...AIRPORTS.filter((a) => a !== EGYPT_AIRPORT)];
    order.forEach((space, i) => {
      s = own(s, space, 1);
      expect(airportRent(s, EGYPT_AIRPORT).amount).toBe(ladder[i]);
    });
  });

  test('landing on another player’s airport charges by their airport count', () => {
    let s = own(game(), [EGYPT_AIRPORT, ...AIRPORTS.filter((a) => a !== EGYPT_AIRPORT).slice(0, 2)], 1);
    s = rollTo(s, EGYPT_AIRPORT).state;
    expect(s.flow.pending?.kind === 'rent' && s.flow.pending.rent).toMatchObject({
      amount: 160,
      freeStayAllowed: false,
    });
    s = act(s, { type: 'payRent' });
    expect(cashOf(s, 0)).toBe(3840);
    expect(cashOf(s, 1)).toBe(4160);
  });
});

describe('companies', () => {
  test('buy a company', () => {
    const s = act(rollTo(game(), TRANSPORT).state, { type: 'buy' });
    expect(s.properties[TRANSPORT]?.owner).toBe(0);
    expect(cashOf(s, 0)).toBe(3800);
  });

  test('rent is two fresh dice × the multiplier (4 + 3 on Transportation = $175)', () => {
    let s = rollTo(own(game(), TRANSPORT, 1), TRANSPORT).state;
    expect(s.flow.phase).toBe('CompanyRoll');
    expect(fail(s, { type: 'payRent' }).code).toBe('wrongPhase');
    const rolled = run(nextDice(s, 4, 3), { type: 'rollCompanyDice' });
    expect(eventsOf(rolled.events, 'diceRolled')[0]).toMatchObject({ purpose: 'company', dice: [4, 3] });
    s = rolled.state;
    expect(s.flow.phase).toBe('RentDue');
    expect(s.flow.pending?.kind === 'rent' && s.flow.pending.rent).toMatchObject({
      amount: 175,
      calc: { kind: 'company', total: 7, multiplier: 25 },
      freeStayAllowed: false,
    });
    s = act(s, { type: 'payRent' });
    expect(cashOf(s, 0)).toBe(3825);
    expect(cashOf(s, 1)).toBe(4175);
  });

  test('company dice never count as doubles and never move the token', () => {
    let s = rollTo(own(game(), TRANSPORT, 1), TRANSPORT, [3, 4]).state;
    const before = s.turn.doublesCount;
    const { state, events } = run(nextDice(s, 2, 2), { type: 'rollCompanyDice' });
    expect(eventsOf(events, 'moved')).toHaveLength(0);
    expect(state.turn.doublesCount).toBe(before);
    expect(state.players[0]?.position).toBe(TRANSPORT);
    s = act(state, { type: 'payRent' });
    expect(s.flow.phase).toBe('AwaitEndTurn');
    expect(cashOf(s, 0)).toBe(4000 - 100);
  });
});
