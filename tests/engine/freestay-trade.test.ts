import { describe, expect, test } from 'vitest';
import { decisionMaker, legalActions, type TradeOffer } from '../../src/engine';
import { act, cashOf, dbg, edit, eventsOf, fail, game, levels, nextDice, own, rollTo, run, spaceOf, spacesOf } from './helpers';

const CAIRO = spaceOf('Cairo');
const ALEXANDRIA = spaceOf('Alexandria');
const EGYPT_AIRPORT = spaceOf('Egypt Airport');
const TRANSPORT = spaceOf('Transportation Company');

describe('Free Stay', () => {
  test('every player starts with 3 tokens (0 when Free Stay is off)', () => {
    expect(game().players.map((p) => p.freeStay)).toEqual([3, 3]);
    expect(game({ freeStay: false }).players.map((p) => p.freeStay)).toEqual([0, 0]);
  });

  test('using a token on another player’s city skips the rent and decrements', () => {
    let s = rollTo(own(game(), CAIRO, 1), CAIRO).state;
    expect(s.flow.pending?.kind === 'rent' && s.flow.pending.rent.freeStayAllowed).toBe(true);
    const { state, events } = run(s, { type: 'useFreeStay' });
    expect(eventsOf(events, 'freeStayUsed')[0]).toMatchObject({ saved: 17, left: 2 });
    expect(state.players[0]?.freeStay).toBe(2);
    expect(cashOf(state, 0)).toBe(4000);
    expect(cashOf(state, 1)).toBe(4000);
    s = state;
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('cities only: not airports, companies or taxes', () => {
    const airport = rollTo(own(game(), EGYPT_AIRPORT, 1), EGYPT_AIRPORT).state;
    expect(fail(airport, { type: 'useFreeStay' }).code).toBe('freeStayUnavailable');
    const company = act(nextDice(rollTo(own(game(), TRANSPORT, 1), TRANSPORT).state, 1, 2), { type: 'rollCompanyDice' });
    expect(fail(company, { type: 'useFreeStay' }).code).toBe('freeStayUnavailable');
    const tax = rollTo(game(), spacesOf('tax').at(-1) as number).state;
    expect(tax.flow.phase).toBe('RentDue');
    expect(fail(tax, { type: 'useFreeStay' }).code).toBe('freeStayUnavailable');
  });

  test('not offered without a token', () => {
    const s = rollTo(
      edit(own(game(), CAIRO, 1), (d) => {
        (d.players[0] as { freeStay: number }).freeStay = 0;
      }),
      CAIRO,
    ).state;
    expect(legalActions(s).map((a) => a.type)).toEqual(['payRent']);
  });
});

function offer(partial: Partial<TradeOffer> & Pick<TradeOffer, 'from' | 'to'>): TradeOffer {
  return {
    give: { properties: [], cash: 0, jailCards: 0 },
    get: { properties: [], cash: 0, jailCards: 0 },
    ...partial,
  };
}

describe('trading', () => {
  test('a valid swap is answered by the partner and applies in one step', () => {
    let s = own(own(game(), CAIRO, 0), ALEXANDRIA, 1);
    const o = offer({
      from: 0,
      to: 1,
      give: { properties: [CAIRO], cash: 100, jailCards: 0 },
      get: { properties: [ALEXANDRIA], cash: 0, jailCards: 0 },
    });
    s = act(s, { type: 'proposeTrade', offer: o });
    expect(s.flow.trade).toEqual(o);
    expect(decisionMaker(s)).toBe(1);
    expect(legalActions(s)).toEqual([
      { type: 'respondTrade', accept: true },
      { type: 'respondTrade', accept: false },
    ]);
    expect(fail(s, { type: 'roll' }).code).toBe('tradePending');
    const { state, events } = run(s, { type: 'respondTrade', accept: true });
    expect(eventsOf(events, 'tradeAccepted')).toHaveLength(1);
    expect(state.properties[CAIRO]?.owner).toBe(1);
    expect(state.properties[ALEXANDRIA]?.owner).toBe(0);
    expect(cashOf(state, 0)).toBe(3900);
    expect(cashOf(state, 1)).toBe(4100);
    expect(state.flow.trade).toBeNull();
    expect(state.flow.phase).toBe('AwaitRoll');
  });

  test('a rejected offer changes nothing', () => {
    const s = own(own(game(), CAIRO, 0), ALEXANDRIA, 1);
    const proposed = act(s, {
      type: 'proposeTrade',
      offer: offer({ from: 0, to: 1, give: { properties: [CAIRO], cash: 50, jailCards: 0 } }),
    });
    const after = act(proposed, { type: 'respondTrade', accept: false });
    expect(after.players).toEqual(s.players);
    expect(after.properties).toEqual(s.properties);
    expect(after.flow.phase).toBe(s.flow.phase);
    expect(after.flow.trade).toBeNull();
  });

  test('a city cannot be traded while its country has buildings', () => {
    const s = levels(own(game(), [CAIRO, ALEXANDRIA], 0), [
      [CAIRO, 1],
      [ALEXANDRIA, 1],
    ]);
    const error = fail(s, {
      type: 'proposeTrade',
      offer: offer({ from: 0, to: 1, give: { properties: [ALEXANDRIA], cash: 0, jailCards: 0 } }),
    });
    expect(error.code).toBe('tradeBuildings');
    expect(error.reason).toBe('Sell the buildings in Egypt before trading Alexandria.');
  });

  test('a mortgaged property stays mortgaged with its new owner, with no fee', () => {
    let s = dbg(own(game(), CAIRO, 0), { op: 'setMortgaged', space: CAIRO, mortgaged: true });
    s = act(
      s,
      { type: 'proposeTrade', offer: offer({ from: 0, to: 1, give: { properties: [CAIRO], cash: 0, jailCards: 0 } }) },
      { type: 'respondTrade', accept: true },
    );
    expect(s.properties[CAIRO]).toEqual({ owner: 1, level: 0, mortgaged: true });
    expect(cashOf(s, 1)).toBe(4000);
  });

  test('Get Out of Jail cards can be traded', () => {
    let s = edit(game(), (d) => {
      d.decks.chanceDeck = d.decks.chanceDeck.filter((id) => id !== 'chance-diplomatic-pass');
      (d.players[1] as { jailCards: string[] }).jailCards = ['chance-diplomatic-pass'];
    });
    s = act(
      s,
      {
        type: 'proposeTrade',
        offer: offer({
          from: 0,
          to: 1,
          give: { properties: [], cash: 50, jailCards: 0 },
          get: { properties: [], cash: 0, jailCards: 1 },
        }),
      },
      { type: 'respondTrade', accept: true },
    );
    expect(s.players[0]?.jailCards).toEqual(['chance-diplomatic-pass']);
    expect(s.players[1]?.jailCards).toEqual([]);
  });

  test('offers are validated: ownership, cash, cards, empty, partner, and no pending decision', () => {
    const s = own(game(), CAIRO, 0);
    expect(fail(s, { type: 'proposeTrade', offer: offer({ from: 0, to: 1 }) }).code).toBe('tradeEmpty');
    expect(
      fail(s, { type: 'proposeTrade', offer: offer({ from: 0, to: 1, get: { properties: [CAIRO], cash: 0, jailCards: 0 } }) })
        .code,
    ).toBe('tradeNotOwned');
    expect(
      fail(s, { type: 'proposeTrade', offer: offer({ from: 0, to: 1, give: { properties: [], cash: 5000, jailCards: 0 } }) })
        .code,
    ).toBe('tradeCash');
    expect(
      fail(s, { type: 'proposeTrade', offer: offer({ from: 0, to: 1, give: { properties: [], cash: 0, jailCards: 1 } }) })
        .code,
    ).toBe('tradeCards');
    expect(
      fail(s, { type: 'proposeTrade', offer: offer({ from: 0, to: 0, give: { properties: [CAIRO], cash: 0, jailCards: 0 } }) })
        .code,
    ).toBe('tradeInvalidPlayer');
    // Only the current player proposes.
    expect(
      fail(s, { type: 'proposeTrade', offer: offer({ from: 1, to: 0, get: { properties: [CAIRO], cash: 0, jailCards: 0 } }) })
        .code,
    ).toBe('wrongPhase');
    const deciding = rollTo(s, spaceOf('Guadalajara')).state;
    expect(deciding.flow.phase).toBe('BuyDecision');
    expect(
      fail(deciding, { type: 'proposeTrade', offer: offer({ from: 0, to: 1, give: { properties: [CAIRO], cash: 0, jailCards: 0 } }) })
        .code,
    ).toBe('wrongPhase');
  });
});
