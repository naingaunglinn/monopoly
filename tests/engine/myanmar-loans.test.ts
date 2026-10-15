// Loans on the Myanmar map (owner's spec 7.11, D104): asking, answering and countering like a trade,
// simple interest capped at three times the amount, paying back, a quarter at Start, the collateral
// at the end of the term and at bankruptcy, and the locks on pledged property.
import { describe, expect, test } from 'vitest';
import { SPACES } from '../../src/data/board';
import {
  legalActions,
  legalActionsFor,
  loanOwed,
  netWorth,
  parseSave,
  serializeGame,
  validateAction,
  type GameState,
  type LoanOffer,
} from '../../src/engine';
import { act, at, cashOf, edit, endTurn, eventsOf, fail, forceCard, game, nextDice, own, rollTo, rollWith, run, setCash, spaceOf, spacesOf } from './helpers';

const mm = (settings: Parameters<typeof game>[0] = {}, seed = 7) => game({ map: 'myanmar', playerCount: 3, ...settings }, seed);

/** Player 0 owns Falam and asks player 1 for 500 lakh at 10% a round over 3 rounds. */
function setup(): { s: GameState; falam: number; offer: LoanOffer } {
  const s0 = mm();
  const falam = spaceOf('Falam');
  const s = own(s0, falam, 0);
  return { s, falam, offer: { from: 0, to: 1, lender: 1, borrower: 0, amount: 500, ratePercent: 10, term: 3, collateral: [falam] } };
}

/** Plays whole rounds of plain moves until the round number is `round`. */
function toRound(s: GameState, round: number): GameState {
  let state = s;
  for (let guard = 0; guard < 60 && state.turn.roundNumber < round; guard++) state = endTurn(rollTo(state, SPACES.jail).state);
  return state;
}

describe('asking for a loan', () => {
  test('a request waits on the table; the lender accepts, pays out, and the loan starts', () => {
    const { s, offer } = setup();
    expect(legalActions(s).some((a) => a.type === 'requestLoan')).toBe(true);
    const asked = act(s, { type: 'requestLoan', offer });
    expect(asked.flow.loan).toEqual(offer);
    expect(legalActions(asked).map((a) => a.type)).toEqual(['respondLoan', 'respondLoan', 'counterLoan']);
    expect(fail(asked, { type: 'roll' }).code).toBe('loanPending');
    expect(legalActionsFor(asked, 0)).toContainEqual({ type: 'withdrawLoan' });
    const { state, events } = run(asked, { type: 'respondLoan', accept: true });
    expect(cashOf(state, 0)).toBe(cashOf(s, 0) + 500);
    expect(cashOf(state, 1)).toBe(cashOf(s, 1) - 500);
    expect(state.economy.loans).toEqual([
      { id: 1, lender: 1, borrower: 0, principal: 500, ratePercent: 10, term: 3, startRound: 1, collateral: [offer.collateral[0]], repaid: 0 },
    ]);
    expect(eventsOf(events, 'loanAccepted')).toHaveLength(1);
  });

  test('counter-offers go back and forth; rejecting or withdrawing clears the table', () => {
    const { s, offer } = setup();
    const asked = act(s, { type: 'requestLoan', offer });
    const counter = { ...offer, from: 1, to: 0, ratePercent: 15 };
    const countered = act(asked, { type: 'counterLoan', offer: counter });
    expect(countered.flow.loan).toEqual(counter);
    expect(act(countered, { type: 'respondLoan', accept: false }).flow.loan).toBeNull();
    expect(act(asked, { type: 'withdrawLoan' }).flow.loan).toBeNull();
    // A counter cannot swap who lends.
    expect(validateAction(asked, { type: 'counterLoan', offer: { ...counter, lender: 0, borrower: 1 } })?.code).toBe('invalidAction');
  });

  test('terms and collateral are checked: rate at most 20%, collateral the borrower’s, unmortgaged, unpledged', () => {
    const { s, offer, falam } = setup();
    expect(validateAction(s, { type: 'requestLoan', offer: { ...offer, ratePercent: 21 } })?.code).toBe('loanTerms');
    expect(validateAction(s, { type: 'requestLoan', offer: { ...offer, term: 0 } })?.code).toBe('loanTerms');
    expect(validateAction(s, { type: 'requestLoan', offer: { ...offer, collateral: [] } })?.code).toBe('loanCollateral');
    expect(validateAction(s, { type: 'requestLoan', offer: { ...offer, collateral: [spaceOf('Hakha')] } })?.code).toBe('loanCollateral');
    const mortgaged = act(s, { type: 'debug', op: 'setMortgaged', space: falam, mortgaged: true } as never);
    expect(validateAction(mortgaged, { type: 'requestLoan', offer })?.code).toBe('loanCollateral');
    // The lender must have the cash when accepting.
    const poor = act(setCash(s, 1, 100), { type: 'requestLoan', offer });
    expect(validateAction(poor, { type: 'respondLoan', accept: true })?.code).toBe('notEnoughCash');
  });

  test('none of this on the World map', () => {
    expect(legalActions(game()).some((a) => a.type === 'requestLoan')).toBe(false);
  });
});

describe('interest and paying back', () => {
  const lent = () => {
    const { s, offer } = setup();
    return act(s, { type: 'requestLoan', offer }, { type: 'respondLoan', accept: true });
  };

  test('simple interest per round passed, never more than three times the amount', () => {
    const s = lent();
    const loan = s.economy.loans[0]!;
    expect(loanOwed(s, loan)).toBe(500);
    const at = (round: number) => loanOwed(edit(s, (d) => void (d.turn.roundNumber = round)), loan);
    expect(at(2)).toBe(550);
    expect(at(4)).toBe(650);
    expect(at(40)).toBe(1500);
  });

  test('the borrower pays back on their own turn; paid off, the loan ends', () => {
    const s = lent();
    expect(legalActions(s)).toContainEqual({ type: 'repayLoan', loanId: 1, amount: 500 });
    const part = act(s, { type: 'repayLoan', loanId: 1, amount: 200 });
    expect(loanOwed(part, part.economy.loans[0]!)).toBe(300);
    const all = run(part, { type: 'repayLoan', loanId: 1, amount: 300 });
    expect(all.state.economy.loans).toEqual([]);
    expect(eventsOf(all.events, 'loanRepaid')[0]).toMatchObject({ amount: 300, left: 0, auto: false });
    expect(fail(s, { type: 'repayLoan', loanId: 1, amount: 501 }).code).toBe('loanRepay');
    // Not on someone else's turn.
    expect(validateAction(endTurn(rollTo(s, SPACES.jail).state), { type: 'repayLoan', loanId: 1, amount: 100 })?.code).toBe('wrongPhase');
  });

  test('passing Start pays back a quarter of the debt when the cash is there', () => {
    const s = lent();
    const passed = rollWith(at(s, 0, 45), 3, 4);
    expect(eventsOf(passed.events, 'loanRepaid')[0]).toMatchObject({ amount: 125, left: 375, auto: true });
  });

  test('at the end of the term the debt with its interest is paid from the borrower’s cash; the collateral stays', () => {
    const s = lent();
    const falam = s.economy.loans[0]!.collateral[0]!;
    // 500 at 10% a round for 3 rounds: 650 falls due at the start of round 4.
    const before = toRound(s, 3);
    const lenderBefore = cashOf(before, 1);
    const borrowerBefore = cashOf(before, 0);
    const due = toRound(before, 4);
    expect(due.economy.loans).toEqual([]);
    expect(due.properties[falam]?.owner).toBe(0);
    const paid = due.meta.log.map((e) => e.event).find((e) => e.type === 'loanDue');
    expect(paid).toMatchObject({ owed: 650, paid: 650, left: 0 });
    // Nothing else moved money between them in these rounds (they only rolled to the camp).
    expect(cashOf(due, 1) - lenderBefore).toBe(650);
    expect(borrowerBefore - cashOf(due, 0)).toBe(650);
  });

  test('a borrower short of cash pays all they have, and the lender takes the collateral too', () => {
    const s = lent();
    const falam = s.economy.loans[0]!.collateral[0]!;
    const poor = toRound(setCash(toRound(s, 3), 0, 200), 4);
    expect(poor.economy.loans).toEqual([]);
    expect(poor.properties[falam]?.owner).toBe(1);
    const due = poor.meta.log.map((e) => e.event).find((e) => e.type === 'loanDue');
    expect(due).toMatchObject({ owed: 650, paid: 200, left: 450 });
  });
});

describe('collateral and bankruptcy', () => {
  test('a pledged property cannot be mortgaged, traded or built on (its whole region)', () => {
    const [falam, hakha] = (mm(), [spaceOf('Falam'), spaceOf('Hakha')]);
    const s = own(mm(), [falam, hakha], 0);
    const offer: LoanOffer = { from: 0, to: 1, lender: 1, borrower: 0, amount: 100, ratePercent: 5, term: 5, collateral: [falam] };
    const lent = act(s, { type: 'requestLoan', offer }, { type: 'respondLoan', accept: true });
    expect(fail(lent, { type: 'mortgage', space: falam }).code).toBe('pledged');
    const trade = { from: 0, to: 2, give: { properties: [falam], cash: 0, jailCards: 0 }, get: { properties: [], cash: 10, jailCards: 0 } };
    expect(fail(lent, { type: 'proposeTrade', offer: trade }).code).toBe('pledged');
    const landed = rollTo(lent, hakha).state;
    expect(landed.flow.phase).not.toBe('BuildOffer');
  });

  test('a bankrupt borrower’s lender takes the collateral before the creditor', () => {
    const [falam, mandalay] = (mm(), [spaceOf('Falam'), spaceOf('Mandalay')]);
    const s = own(own(setCash(mm({ mode: 'normal' }), 0, 0), falam, 0), mandalay, 2);
    const offer: LoanOffer = { from: 0, to: 1, lender: 1, borrower: 0, amount: 50, ratePercent: 0, term: 9, collateral: [falam] };
    let lent = act(s, { type: 'requestLoan', offer }, { type: 'respondLoan', accept: true });
    // Rent to player 2 that player 0 cannot pay: bankrupt to player 2.
    lent = rollTo(lent, mandalay).state;
    const broke = run(lent, { type: 'payRent' });
    expect(eventsOf(broke.events, 'loanDefaulted')[0]).toMatchObject({ lender: 1, borrower: 0, why: 'bankruptcy' });
    expect(broke.state.properties[falam]?.owner).toBe(1);
  });

  test('net worth counts what a player is owed and owes', () => {
    const { s, offer } = setup();
    const lent = act(s, { type: 'requestLoan', offer }, { type: 'respondLoan', accept: true });
    expect(netWorth(lent, 1).total).toBe(netWorth(s, 1).total);
    expect(netWorth(lent, 0).total).toBe(netWorth(s, 0).total);
  });

  test('the internet cut stops loan requests too, except from the MPT owner', () => {
    const { s, offer } = setup();
    const mpt = spaceOf('MPT (mobile network)');
    const news = spacesOf('event')[0] as number;
    const cut = endTurn(act(rollTo(forceCard(own(s, mpt, 2), 'mm-event-internet'), news).state, { type: 'confirmCard' }));
    expect(validateAction(cut, { type: 'requestLoan', offer })?.code).toBe('tradeBlocked');
  });

  test('a request and a counter-offer on the table survive a save and a load', () => {
    const { s, offer } = setup();
    const asked = act(s, { type: 'requestLoan', offer });
    const countered = act(asked, { type: 'counterLoan', offer: { ...offer, from: 1, to: 0, amount: 400 } });
    const lent = act(asked, { type: 'respondLoan', accept: true });
    for (const state of [asked, countered, lent, nextDice(lent, 1, 2)]) {
      const parsed = parseSave(serializeGame(state));
      expect(parsed.ok && parsed.state).toEqual(state);
    }
  });
});
