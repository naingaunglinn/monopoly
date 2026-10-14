import { describe, expect, test } from 'vitest';
import { actorFor, decisionMaker, legalActions, legalActionsFor, type TradeOffer } from '../../src/engine';
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
      { type: 'counterTrade', offer: null },
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
    // Offers wait while a decision is being made (here: buying), whoever makes them.
    const deciding = rollTo(s, spaceOf('Guadalajara')).state;
    expect(deciding.flow.phase).toBe('BuyDecision');
    for (const from of [0, 1]) {
      const error = fail(deciding, { type: 'proposeTrade', offer: offer({ from, to: 1 - from, give: { properties: [], cash: 10, jailCards: 0 } }) });
      expect(error.code).toBe('tradeWait');
      expect(error.reason).toBe('Offers can be sent once Player 1 has made their decision.');
    }
  });
});

describe('negotiating (D99)', () => {
  /** Three players: Mia (0) holds Cairo, Leo (1) Alexandria; it is Mia's turn to roll. */
  const table = () => own(own(game({ playerCount: 3 }), CAIRO, 0), ALEXANDRIA, 1);
  const leoAsksForCairo = offer({
    from: 1,
    to: 0,
    give: { properties: [], cash: 150, jailCards: 0 },
    get: { properties: [CAIRO], cash: 0, jailCards: 0 },
  });

  test('any player may make an offer on someone else’s turn; the game waits for the answer', () => {
    const s = table();
    expect(s.turn.currentPlayerIndex).toBe(0);
    for (const player of [0, 1, 2]) expect(legalActionsFor(s, player)).toContainEqual({ type: 'proposeTrade', offer: null });
    expect(actorFor(s, { type: 'proposeTrade', offer: leoAsksForCairo })).toBe(1);
    const { state, events } = run(s, { type: 'proposeTrade', offer: leoAsksForCairo });
    expect(eventsOf(events, 'tradeProposed')).toEqual([{ type: 'tradeProposed', from: 1, to: 0 }]);
    expect(decisionMaker(state)).toBe(0);
    expect(fail(state, { type: 'roll' }).code).toBe('tradePending');
    // A second offer waits until this one is answered.
    expect(fail(state, { type: 'proposeTrade', offer: offer({ from: 2, to: 1, give: { properties: [], cash: 10, jailCards: 0 } }) }).code).toBe(
      'tradePending',
    );
    const after = run(state, { type: 'respondTrade', accept: true }).state;
    expect(after.properties[CAIRO]?.owner).toBe(1);
    expect([cashOf(after, 0), cashOf(after, 1)]).toEqual([4150, 3850]);
    expect(after.flow.phase).toBe('AwaitRoll');
    expect(after.turn.currentPlayerIndex).toBe(0);
  });

  test('the partner can answer with a counter-offer, and the first player accepts, rejects or counters again', () => {
    let s = act(table(), { type: 'proposeTrade', offer: leoAsksForCairo });
    // Mia wants more: $250 for Cairo.
    const counter = offer({
      from: 0,
      to: 1,
      give: { properties: [CAIRO], cash: 0, jailCards: 0 },
      get: { properties: [], cash: 250, jailCards: 0 },
    });
    expect(actorFor(s, { type: 'counterTrade', offer: counter })).toBe(0);
    const countered = run(s, { type: 'counterTrade', offer: counter });
    expect(eventsOf(countered.events, 'tradeCountered')).toEqual([{ type: 'tradeCountered', from: 0, to: 1 }]);
    s = countered.state;
    expect(s.flow.trade).toEqual(counter);
    expect(decisionMaker(s)).toBe(1);
    expect(legalActionsFor(s, 0)).toEqual([{ type: 'withdrawTrade' }]);
    expect(legalActionsFor(s, 2)).toEqual([]);
    // Leo meets her halfway with a counter of his own...
    const meet = offer({ from: 1, to: 0, give: { properties: [], cash: 200, jailCards: 0 }, get: { properties: [CAIRO], cash: 0, jailCards: 0 } });
    s = act(s, { type: 'counterTrade', offer: meet });
    expect(decisionMaker(s)).toBe(0);
    // ...and Mia accepts it.
    s = act(s, { type: 'respondTrade', accept: true });
    expect(s.properties[CAIRO]?.owner).toBe(1);
    expect([cashOf(s, 0), cashOf(s, 1)]).toEqual([4200, 3800]);
    expect(s.flow.trade).toBeNull();
  });

  test('a counter-offer goes back the other way and is checked like any offer', () => {
    const s = act(table(), { type: 'proposeTrade', offer: leoAsksForCairo });
    // Not back to the player who offered.
    expect(fail(s, { type: 'counterTrade', offer: offer({ from: 0, to: 2, give: { properties: [], cash: 10, jailCards: 0 } }) }).code).toBe(
      'invalidAction',
    );
    // Only what each side owns and can afford.
    expect(
      fail(s, { type: 'counterTrade', offer: offer({ from: 0, to: 1, get: { properties: [], cash: 9000, jailCards: 0 } }) }).code,
    ).toBe('tradeCash');
    expect(fail(s, { type: 'counterTrade', offer: offer({ from: 0, to: 1 }) }).code).toBe('tradeEmpty');
    // No counter without an offer on the table.
    expect(fail(table(), { type: 'counterTrade', offer: offer({ from: 0, to: 1, give: { properties: [], cash: 10, jailCards: 0 } }) }).code).toBe(
      'wrongPhase',
    );
  });

  test('the player who made the offer can withdraw it; the game goes on', () => {
    const s = act(table(), { type: 'proposeTrade', offer: leoAsksForCairo });
    expect(actorFor(s, { type: 'withdrawTrade' })).toBe(1);
    expect(legalActions(s).map((a) => a.type)).not.toContain('withdrawTrade');
    const { state, events } = run(s, { type: 'withdrawTrade' });
    expect(eventsOf(events, 'tradeWithdrawn')).toEqual([{ type: 'tradeWithdrawn', from: 1, to: 0 }]);
    expect(state.flow.trade).toBeNull();
    expect(state.properties).toEqual(table().properties);
    expect(legalActions(state).map((a) => a.type)).toContain('roll');
    expect(fail(state, { type: 'withdrawTrade' }).code).toBe('wrongPhase');
  });

  test('another player may offer a debtor a deal that pays their debt', () => {
    // Mia owes Leo rent she cannot pay; Aung offers $400 for her Cairo.
    let s = own(own(game({ playerCount: 3 }), CAIRO, 0), [ALEXANDRIA, EGYPT_AIRPORT], 1);
    s = edit(s, (d) => {
      (d.players[0] as { cash: number }).cash = 10;
    });
    s = act(rollTo(s, EGYPT_AIRPORT).state, { type: 'payRent' });
    expect(s.flow.phase).toBe('Debt');
    const deal = offer({ from: 2, to: 0, give: { properties: [], cash: 400, jailCards: 0 }, get: { properties: [CAIRO], cash: 0, jailCards: 0 } });
    s = act(s, { type: 'proposeTrade', offer: deal }, { type: 'respondTrade', accept: true }, { type: 'payDebt' });
    expect(s.properties[CAIRO]?.owner).toBe(2);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });
});
