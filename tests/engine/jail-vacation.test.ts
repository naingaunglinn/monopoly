import { describe, expect, test } from 'vitest';
import { decisionMaker, legalActions, type GameState } from '../../src/engine';
import { act, cashOf, edit, endTurn, eventsOf, fail, forceCard, game, nextDice, own, rollTo, rollWith, run } from './helpers';

const GO_TO_JAIL = 57;
const FREE_PARKING = 34;
const VACATION = 40;

/** Player 0 goes to Jail, player 1 rests; returns player 0's next turn start. */
function jailedAtTurnStart(settings = {}): GameState {
  let s = rollTo(game({ auction: false, ...settings }), GO_TO_JAIL).state;
  s = endTurn(s);
  s = endTurn(rollTo(s, FREE_PARKING).state);
  return s;
}

describe('Jail', () => {
  test('landing on Go To Jail: straight to space 17, no World Start money, the turn ends', () => {
    const { state, events } = rollTo(game(), GO_TO_JAIL);
    expect(state.players[0]).toMatchObject({ position: 17, inJail: true, jailAttempts: 0 });
    expect(eventsOf(events, 'jailed')[0]?.reason).toBe('space');
    expect(cashOf(state, 0)).toBe(4000);
    expect(state.flow.phase).toBe('AwaitEndTurn');
  });

  test('a Go To Jail card', () => {
    let s = rollTo(forceCard(game(), 'chance-customs-trouble'), 13).state;
    s = act(s, { type: 'confirmCard' });
    expect(s.players[0]).toMatchObject({ position: 17, inJail: true });
  });

  test('doubles before going to Jail are ignored', () => {
    const s = rollTo(game(), GO_TO_JAIL, [3, 3]).state;
    expect(s.flow.phase).toBe('AwaitEndTurn');
    expect(s.turn.rollsLeft).toBe(0);
  });

  test('landing on the Jail space by a normal move is just visiting', () => {
    const s = rollTo(game(), 17).state;
    expect(s.players[0]?.inJail).toBe(false);
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('at the start of a turn in Jail the player picks an option', () => {
    const s = jailedAtTurnStart();
    expect(s.turn.currentPlayerIndex).toBe(0);
    expect(s.flow.phase).toBe('TurnStart');
    expect(s.flow.pending).toEqual({ kind: 'jailChoice' });
    const types = legalActions(s).map((a) => a.type);
    expect(types).toContain('payJailFine');
    expect(types).toContain('rollForDoubles');
    expect(types).not.toContain('useJailCard');
    expect(fail(s, { type: 'roll' }).code).toBe('wrongPhase');
  });

  test('pay $300: leave, then roll and move as a normal turn', () => {
    let s = act(jailedAtTurnStart(), { type: 'payJailFine' });
    expect(cashOf(s, 0)).toBe(3700);
    expect(s.players[0]?.inJail).toBe(false);
    expect(s.flow.phase).toBe('AwaitRoll');
    s = rollWith(s, 1, 2).state;
    expect(s.players[0]?.position).toBe(20);
  });

  test('paying is refused without $300', () => {
    const s = edit(jailedAtTurnStart(), (d) => {
      (d.players[0] as { cash: number }).cash = 200;
    });
    expect(fail(s, { type: 'payJailFine' }).code).toBe('notEnoughCash');
  });

  test('use a Get Out of Jail card: leave and roll; the card is discarded', () => {
    let s = edit(jailedAtTurnStart(), (d) => {
      d.decks.chanceDeck = d.decks.chanceDeck.filter((id) => id !== 'chance-diplomatic-pass');
      (d.players[0] as { jailCards: string[] }).jailCards = ['chance-diplomatic-pass'];
    });
    s = act(s, { type: 'useJailCard' });
    expect(s.players[0]?.inJail).toBe(false);
    expect(s.players[0]?.jailCards).toEqual([]);
    expect(s.decks.chanceDiscard).toContain('chance-diplomatic-pass');
    expect(cashOf(s, 0)).toBe(4000);
    expect(s.flow.phase).toBe('AwaitRoll');
  });

  test('rolling doubles leaves Jail and moves that total, with no extra roll', () => {
    const { state, events } = run(nextDice(jailedAtTurnStart(), 2, 2), { type: 'rollForDoubles' });
    expect(eventsOf(events, 'leftJail')[0]?.how).toBe('doubles');
    expect(state.players[0]?.position).toBe(21);
    expect(state.flow.phase).toBe('BuyDecision');
    const after = act(state, { type: 'decline' });
    expect(after.flow.phase).toBe('AwaitEndTurn');
  });

  test('a failed roll stays in Jail and ends the turn', () => {
    const s = run(nextDice(jailedAtTurnStart(), 1, 2), { type: 'rollForDoubles' }).state;
    expect(s.players[0]).toMatchObject({ position: 17, inJail: true, jailAttempts: 1 });
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('after the third failed roll the player must pay $300 and moves that total', () => {
    const s = edit(jailedAtTurnStart(), (d) => {
      (d.players[0] as { jailAttempts: number }).jailAttempts = 2;
    });
    const { state, events } = run(nextDice(s, 1, 2), { type: 'rollForDoubles' });
    expect(eventsOf(events, 'feePaid')[0]).toMatchObject({ amount: 300, reason: 'jailFine' });
    expect(eventsOf(events, 'leftJail')[0]?.how).toBe('forcedFine');
    expect(state.players[0]).toMatchObject({ position: 20, inJail: false });
    expect(cashOf(state, 0)).toBe(3700);
  });

  test('the forced fine follows the debt rules when cash is short', () => {
    let s = edit(own(jailedAtTurnStart(), [9, 15, 12], 0), (d) => {
      const p = d.players[0] as { jailAttempts: number; cash: number };
      p.jailAttempts = 2;
      p.cash = 100;
    });
    s = run(nextDice(s, 1, 2), { type: 'rollForDoubles' }).state;
    expect(s.flow.phase).toBe('Debt');
    expect(s.flow.debts[0]).toMatchObject({ debtor: 0, creditor: null, amount: 300 });
    expect(s.players[0]?.position).toBe(17);
    s = act(s, { type: 'mortgage', space: 9 }); // $155
    expect(fail(s, { type: 'payDebt' }).code).toBe('debtNotCovered');
    s = act(s, { type: 'mortgage', space: 15 }, { type: 'mortgage', space: 12 }, { type: 'payDebt' }); // $300
    expect(cashOf(s, 0)).toBe(0);
    // Paid: leave Jail and move the rolled total (17 + 3 = Tel Aviv).
    expect(s.players[0]).toMatchObject({ position: 20, inJail: false });
    expect(s.flow.phase).toBe('BuyDecision');
  });

  test('jailed players may mortgage and trade before choosing', () => {
    const s = own(jailedAtTurnStart(), 9, 0);
    const types = legalActions(s).map((a) => a.type);
    expect(types).toContain('mortgage');
    expect(types).toContain('proposeTrade');
  });
});

describe('Vacation', () => {
  test('landing on Vacation skips the next turn exactly once', () => {
    let s = rollTo(game(), VACATION).state;
    expect(s.players[0]?.skipNextTurn).toBe(true);
    expect(s.flow.notices).toEqual([{ kind: 'vacation', player: 0 }]);
    s = endTurn(s);
    s = endTurn(rollTo(s, FREE_PARKING).state); // player 1
    expect(s.turn.currentPlayerIndex).toBe(0);
    expect(s.flow.phase).toBe('TurnStart');
    expect(s.flow.pending).toEqual({ kind: 'vacationSkip' });
    expect(decisionMaker(s)).toBe(0);
    s = act(s, { type: 'acknowledge' });
    expect(s.turn.currentPlayerIndex).toBe(1);
    expect(s.players[0]?.skipNextTurn).toBe(false);
    s = endTurn(rollTo(s, FREE_PARKING).state);
    expect(s.turn.currentPlayerIndex).toBe(0);
    expect(s.flow.phase).toBe('AwaitRoll');
  });

  test('doubles still re-roll on the landing turn', () => {
    let s = rollTo(game(), VACATION, [3, 3]).state;
    s = act(s, { type: 'acknowledge' });
    expect(s.flow.phase).toBe('AwaitRoll');
  });

  test('ownership and rent income continue while on vacation', () => {
    let s = own(game(), 12, 0);
    s = endTurn(rollTo(s, VACATION).state);
    s = act(rollTo(s, 12).state, { type: 'payRent' }); // player 1 pays player 0
    expect(cashOf(s, 0)).toBe(4017);
  });

  test('a skipped turn is not a Jail attempt', () => {
    let s = edit(game(), (d) => {
      const p = d.players[1] as { inJail: boolean; position: number; skipNextTurn: boolean };
      p.inJail = true;
      p.position = 17;
      p.skipNextTurn = true;
    });
    s = endTurn(rollTo(s, FREE_PARKING).state);
    expect(s.flow.pending).toEqual({ kind: 'vacationSkip' });
    s = act(s, { type: 'acknowledge' });
    s = endTurn(rollTo(s, FREE_PARKING).state);
    expect(s.turn.currentPlayerIndex).toBe(1);
    expect(s.flow.pending).toEqual({ kind: 'jailChoice' });
    expect(s.players[1]?.jailAttempts).toBe(0);
  });
});
