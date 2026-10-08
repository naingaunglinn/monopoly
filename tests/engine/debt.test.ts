import { describe, expect, test } from 'vitest';
import { decisionMaker, legalActions } from '../../src/engine';
import { act, cashOf, dbg, edit, eventsOf, fail, forceCard, game, levels, own, rollTo, run, setCash } from './helpers';

const MEXICO = [6, 8, 10];
const MEXICO_AIRPORT = 9;
const CAIRO = 12;
const ALEXANDRIA = 14;

/** Player 0 owns Mexico with one house each, has $10, and lands on player 1's Cairo. */
function owingRentWithHouses(settings = {}) {
  let s = levels(own(game(settings), MEXICO, 0), [
    [6, 1],
    [8, 1],
    [10, 1],
  ]);
  s = own(s, [CAIRO, ALEXANDRIA], 1);
  s = setCash(s, 0, 10);
  s = rollTo(s, CAIRO).state;
  return act(s, { type: 'payRent' });
}

describe('debt', () => {
  test('owing more than your cash opens the Debt phase with amount, creditor and shortfall', () => {
    const { state, events } = run(
      rollTo(setCash(own(own(game(), [CAIRO, ALEXANDRIA], 1), MEXICO_AIRPORT, 0), 0, 10), CAIRO).state,
      { type: 'payRent' },
    );
    expect(state.flow.phase).toBe('Debt');
    expect(state.flow.debts[0]).toMatchObject({ debtor: 0, creditor: 1, amount: 34 });
    expect(eventsOf(events, 'debtStarted')[0]).toMatchObject({ amount: 34, shortfall: 24 });
    expect(decisionMaker(state)).toBe(0);
    expect(fail(state, { type: 'payDebt' }).code).toBe('debtNotCovered');
    expect(fail(state, { type: 'endTurn' }).code).toBe('wrongPhase');
    expect(cashOf(state, 0)).toBe(10);
  });

  test('sell buildings to cover a debt, then pay', () => {
    let s = owingRentWithHouses();
    expect(s.flow.phase).toBe('Debt');
    s = act(s, { type: 'sellBuilding', space: 6 });
    expect(cashOf(s, 0)).toBe(33);
    expect(fail(s, { type: 'payDebt' }).reason).toBe('You still need $1 more to pay.');
    s = act(s, { type: 'sellBuilding', space: 8 }, { type: 'payDebt' });
    expect(cashOf(s, 0)).toBe(56 - 34);
    expect(cashOf(s, 1)).toBe(4034);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('mortgage to cover a debt', () => {
    let s = rollTo(setCash(own(own(game(), CAIRO, 1), MEXICO_AIRPORT, 0), 0, 10), CAIRO).state;
    s = act(s, { type: 'payRent' });
    expect(s.flow.phase).toBe('Debt');
    expect(legalActions(s).map((a) => a.type)).toEqual(['declareBankruptcy', 'mortgage', 'proposeTrade']);
    s = act(s, { type: 'mortgage', space: MEXICO_AIRPORT }, { type: 'payDebt' });
    expect(cashOf(s, 0)).toBe(10 + 55 - 17);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('propose a trade while in debt', () => {
    let s = rollTo(setCash(own(own(game(), CAIRO, 1), MEXICO_AIRPORT, 0), 0, 10), CAIRO).state;
    s = act(s, { type: 'payRent' });
    s = act(
      s,
      {
        type: 'proposeTrade',
        offer: {
          from: 0,
          to: 1,
          give: { properties: [MEXICO_AIRPORT], cash: 0, jailCards: 0 },
          get: { properties: [], cash: 100, jailCards: 0 },
        },
      },
      { type: 'respondTrade', accept: true },
      { type: 'payDebt' },
    );
    expect(cashOf(s, 0)).toBe(10 + 100 - 17);
    expect(s.properties[MEXICO_AIRPORT]?.owner).toBe(1);
  });

  test('bankrupt to a player: buildings sold first, everything else goes to the creditor', () => {
    let s = owingRentWithHouses({ playerCount: 3, mode: 'normal' });
    s = dbg(s, { op: 'setOwner', space: MEXICO_AIRPORT, owner: 0 });
    s = dbg(s, { op: 'setMortgaged', space: MEXICO_AIRPORT, mortgaged: true });
    s = edit(s, (d) => {
      d.decks.chanceDeck = d.decks.chanceDeck.filter((id) => id !== 'chance-diplomatic-pass');
      (d.players[0] as { jailCards: string[] }).jailCards = ['chance-diplomatic-pass'];
    });
    // setOwner on Mexico Airport does not touch the Mexico houses.
    expect(s.properties[6]?.level).toBe(1);
    const { state, events } = run(s, { type: 'declareBankruptcy' });
    expect(eventsOf(events, 'bankrupt')[0]).toMatchObject({ player: 0, creditor: 1, cash: 10 + 3 * 23 });
    expect(state.players[0]).toMatchObject({ bankrupt: true, cash: 0, jailCards: [] });
    expect(cashOf(state, 1)).toBe(4000 + 79);
    for (const space of MEXICO) expect(state.properties[space]).toEqual({ owner: 1, level: 0, mortgaged: false });
    expect(state.properties[MEXICO_AIRPORT]).toEqual({ owner: 1, level: 0, mortgaged: true });
    expect(state.decks.chanceDiscard).toContain('chance-diplomatic-pass');
    expect(state.flow.notices).toEqual([{ kind: 'bankruptcy', player: 0, creditor: 1 }]);
    // The bankrupt player's turn is over; the next living player is up.
    expect(state.turn.currentPlayerIndex).toBe(1);
    expect(legalActions(state)).toEqual([{ type: 'acknowledge' }]);
  });

  test('bankrupt to the bank: properties become unowned and unmortgaged', () => {
    let s = levels(own(game({ playerCount: 3, mode: 'normal' }), MEXICO, 0), [
      [6, 1],
      [8, 1],
      [10, 1],
    ]);
    s = dbg(own(s, MEXICO_AIRPORT, 0), { op: 'setMortgaged', space: MEXICO_AIRPORT, mortgaged: true });
    s = rollTo(setCash(s, 0, 10), 65).state; // Luxury Tax $500
    s = act(s, { type: 'payRent' });
    expect(s.flow.debts[0]).toMatchObject({ creditor: null, amount: 500 });
    const totalBefore = s.players.reduce((n, p) => n + p.cash, 0);
    s = act(s, { type: 'declareBankruptcy' });
    for (const space of [...MEXICO, MEXICO_AIRPORT]) {
      expect(s.properties[space]).toEqual({ owner: null, level: 0, mortgaged: false });
    }
    // The bank keeps the cash.
    expect(s.players.reduce((n, p) => n + p.cash, 0)).toBe(totalBefore - 10);
  });

  test('a bankrupt player is out of the turn order', () => {
    let s = rollTo(setCash(own(game({ playerCount: 3, mode: 'normal' }), CAIRO, 1), 0, 10), CAIRO).state;
    const { state, events } = run(s, { type: 'payRent' });
    // No buildings and no unmortgaged property: bankruptcy is automatic.
    expect(eventsOf(events, 'bankrupt')).toHaveLength(1);
    expect(eventsOf(events, 'debtStarted')).toHaveLength(0);
    s = act(state, { type: 'acknowledge' });
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(s.turn.currentPlayerIndex);
      s = act(rollTo(s, 34).state, { type: 'endTurn' });
    }
    expect(seen).toEqual([1, 2, 1, 2, 1, 2]);
  });

  test('bankruptcy is automatic once the last property is mortgaged and the debt is still short', () => {
    let s = levels(own(game({ playerCount: 3, mode: 'normal' }), [CAIRO, ALEXANDRIA], 1), [
      [CAIRO, 1],
      [ALEXANDRIA, 1],
    ]);
    s = setCash(own(s, 1, 0), 0, 0); // player 0: $0 and only Brasília ($35 mortgage)
    s = act(rollTo(s, CAIRO).state, { type: 'payRent' }); // $17 × 4 = $68
    expect(s.flow.phase).toBe('Debt');
    const { state, events } = run(s, { type: 'mortgage', space: 1 });
    expect(eventsOf(events, 'bankrupt')[0]).toMatchObject({ player: 0, creditor: 1, cash: 35 });
    expect(state.properties[1]).toEqual({ owner: 1, level: 0, mortgaged: true });
    expect(cashOf(state, 1)).toBe(4035);
    expect(state.turn.currentPlayerIndex).toBe(1);
  });

  test('another player can be in debt during your turn (cashPerPlayer)', () => {
    let s = own(game({ playerCount: 3 }), MEXICO_AIRPORT, 1);
    s = setCash(s, 1, 50);
    s = rollTo(forceCard(s, 'chance-tour-guide'), 13).state;
    s = act(s, { type: 'confirmCard' });
    expect(s.flow.phase).toBe('Debt');
    expect(s.flow.debts.map((d) => [d.debtor, d.creditor, d.amount])).toEqual([
      [1, 0, 100],
      [2, 0, 100],
    ]);
    expect(decisionMaker(s)).toBe(1);
    expect(fail(s, { type: 'endTurn' }).code).toBe('wrongPhase');
    s = act(s, { type: 'mortgage', space: MEXICO_AIRPORT }, { type: 'payDebt' });
    expect(s.players.map((p) => p.cash)).toEqual([4200, 5, 3900]);
    expect(s.flow.phase).toBe('AwaitEndTurn');
    expect(decisionMaker(s)).toBe(0);
  });

  test('if the drawer goes bankrupt on a card, the others still settle their share before the turn passes', () => {
    let s = own(own(game({ playerCount: 3, mode: 'normal' }), 1, 0), [3, 6], 1);
    s = setCash(setCash(s, 0, 50), 1, 50);
    s = rollTo(forceCard(s, 'event-global-recession'), 19).state;
    s = act(s, { type: 'confirmCard' });
    expect(s.flow.debts[0]).toMatchObject({ debtor: 0, amount: 100 });
    s = act(s, { type: 'declareBankruptcy' }, { type: 'acknowledge' });
    // Player 0 is out, but player 1 still owes the bank before the turn passes.
    expect(s.players[0]?.bankrupt).toBe(true);
    expect(s.flow.phase).toBe('Debt');
    expect(decisionMaker(s)).toBe(1);
    s = act(s, { type: 'mortgage', space: 3 }, { type: 'mortgage', space: 6 }, { type: 'payDebt' });
    expect(s.players.map((p) => p.cash)).toEqual([0, 50, 3900]);
    expect(s.turn.currentPlayerIndex).toBe(1);
    expect(s.flow.phase).toBe('AwaitRoll');
  });

  test('a payment owed to several players is paid in turn order', () => {
    let s = own(game({ playerCount: 3 }), MEXICO_AIRPORT, 0);
    s = setCash(s, 0, 150);
    s = rollTo(forceCard(s, 'chance-group-dinner'), 13).state;
    s = act(s, { type: 'confirmCard' });
    expect(cashOf(s, 1)).toBe(4100);
    expect(s.flow.debts[0]).toMatchObject({ debtor: 0, creditor: 2, amount: 100 });
    expect(cashOf(s, 0)).toBe(50);
    s = act(s, { type: 'mortgage', space: MEXICO_AIRPORT }, { type: 'payDebt' });
    expect(s.players.map((p) => p.cash)).toEqual([5, 4100, 4100]);
  });
});
