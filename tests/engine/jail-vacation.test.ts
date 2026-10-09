import { describe, expect, test } from 'vitest';
import { isProperty, SPACES } from '../../src/data/board';
import { decisionMaker, legalActions, type GameState } from '../../src/engine';
import { act, cashOf, edit, endTurn, eventsOf, fail, firstOf, forceCard, game, nextDice, own, rollTo, rollWith, run, spaceOf } from './helpers';

const JAIL = SPACES.jail;
const GO_TO_JAIL = SPACES.goToJail;
const VACATION = SPACES.vacation;
/** Visiting the Jail: a landing where nothing happens. */
const REST = SPACES.jail;

/** Player 0 goes to Jail, player 1 rests; returns player 0's next turn start. */
function jailedAtTurnStart(settings = {}): GameState {
  let s = rollTo(game({ auction: false, ...settings }), GO_TO_JAIL).state;
  s = endTurn(s);
  s = endTurn(rollTo(s, REST).state);
  return s;
}

describe('Jail', () => {
  test('landing on Go To Jail: straight to the Jail, no World Start money, the turn ends', () => {
    const { state, events } = rollTo(game(), GO_TO_JAIL);
    expect(state.players[0]).toMatchObject({ position: JAIL, inJail: true, jailAttempts: 0 });
    expect(eventsOf(events, 'jailed')[0]?.reason).toBe('space');
    expect(cashOf(state, 0)).toBe(4000);
    expect(state.flow.phase).toBe('AwaitEndTurn');
  });

  test('a Go To Jail card', () => {
    let s = rollTo(forceCard(game(), 'chance-customs-trouble'), firstOf('chance')).state;
    s = act(s, { type: 'confirmCard' });
    expect(s.players[0]).toMatchObject({ position: JAIL, inJail: true });
  });

  test('doubles before going to Jail are ignored', () => {
    const s = rollTo(game(), GO_TO_JAIL, [3, 3]).state;
    expect(s.flow.phase).toBe('AwaitEndTurn');
    expect(s.turn.rollsLeft).toBe(0);
  });

  test('landing on the Jail space by a normal move is just visiting', () => {
    const s = rollTo(game(), JAIL).state;
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
    expect(s.players[0]?.position).toBe(JAIL + 3);
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
    // The smallest doubles that land on a property.
    const d = [1, 2, 3, 4, 5, 6].find((n) => isProperty(JAIL + 2 * n)) as number;
    const { state, events } = run(nextDice(jailedAtTurnStart(), d, d), { type: 'rollForDoubles' });
    expect(eventsOf(events, 'leftJail')[0]?.how).toBe('doubles');
    expect(state.players[0]?.position).toBe(JAIL + 2 * d);
    expect(state.flow.phase).toBe('BuyDecision');
    const after = act(state, { type: 'decline' });
    expect(after.flow.phase).toBe('AwaitEndTurn');
  });

  test('a failed roll stays in Jail and ends the turn', () => {
    const s = run(nextDice(jailedAtTurnStart(), 1, 2), { type: 'rollForDoubles' }).state;
    expect(s.players[0]).toMatchObject({ position: JAIL, inJail: true, jailAttempts: 1 });
    expect(s.flow.phase).toBe('AwaitEndTurn');
  });

  test('after the third failed roll the player must pay $300 and moves that total', () => {
    const s = edit(jailedAtTurnStart(), (d) => {
      (d.players[0] as { jailAttempts: number }).jailAttempts = 2;
    });
    const { state, events } = run(nextDice(s, 1, 2), { type: 'rollForDoubles' });
    expect(eventsOf(events, 'feePaid')[0]).toMatchObject({ amount: 300, reason: 'jailFine' });
    expect(eventsOf(events, 'leftJail')[0]?.how).toBe('forcedFine');
    expect(state.players[0]).toMatchObject({ position: JAIL + 3, inJail: false });
    expect(cashOf(state, 0)).toBe(3700);
  });

  test('the forced fine follows the debt rules when cash is short', () => {
    const [mexicoCity, egyptAirport, cairo] = [spaceOf('Mexico City'), spaceOf('Egypt Airport'), spaceOf('Cairo')];
    // A failed (not doubles) roll that then lands on a property nobody owns.
    const [a, b] = ([[1, 2], [1, 3], [2, 3], [1, 4], [2, 4], [1, 5], [3, 4]] as const).find(
      ([x, y]) => isProperty(JAIL + x + y) && ![mexicoCity, egyptAirport, cairo].includes(JAIL + x + y),
    ) as readonly [number, number];
    let s = edit(own(jailedAtTurnStart(), [mexicoCity, egyptAirport, cairo], 0), (d) => {
      const p = d.players[0] as { jailAttempts: number; cash: number };
      p.jailAttempts = 2;
      p.cash = 100;
    });
    s = run(nextDice(s, a, b), { type: 'rollForDoubles' }).state;
    expect(s.flow.phase).toBe('Debt');
    expect(s.flow.debts[0]).toMatchObject({ debtor: 0, creditor: null, amount: 300 });
    expect(s.players[0]?.position).toBe(JAIL);
    s = act(s, { type: 'mortgage', space: mexicoCity }); // $155
    expect(fail(s, { type: 'payDebt' }).code).toBe('debtNotCovered');
    s = act(s, { type: 'mortgage', space: egyptAirport }, { type: 'mortgage', space: cairo }, { type: 'payDebt' }); // $300
    expect(cashOf(s, 0)).toBe(0);
    // Paid: leave Jail and move the rolled total, onto the property.
    expect(s.players[0]).toMatchObject({ position: JAIL + a + b, inJail: false });
    expect(s.flow.phase).toBe('BuyDecision');
  });

  test('jailed players may mortgage and trade before choosing', () => {
    const s = own(jailedAtTurnStart(), spaceOf('Mexico City'), 0);
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
    s = endTurn(rollTo(s, REST).state); // player 1
    expect(s.turn.currentPlayerIndex).toBe(0);
    expect(s.flow.phase).toBe('TurnStart');
    expect(s.flow.pending).toEqual({ kind: 'vacationSkip' });
    expect(decisionMaker(s)).toBe(0);
    s = act(s, { type: 'acknowledge' });
    expect(s.turn.currentPlayerIndex).toBe(1);
    expect(s.players[0]?.skipNextTurn).toBe(false);
    s = endTurn(rollTo(s, REST).state);
    expect(s.turn.currentPlayerIndex).toBe(0);
    expect(s.flow.phase).toBe('AwaitRoll');
  });

  test('doubles still re-roll on the landing turn', () => {
    let s = rollTo(game(), VACATION, [3, 3]).state;
    s = act(s, { type: 'acknowledge' });
    expect(s.flow.phase).toBe('AwaitRoll');
  });

  test('ownership and rent income continue while on vacation', () => {
    const cairo = spaceOf('Cairo');
    let s = own(game(), cairo, 0);
    s = endTurn(rollTo(s, VACATION).state);
    s = act(rollTo(s, cairo).state, { type: 'payRent' }); // player 1 pays player 0
    expect(cashOf(s, 0)).toBe(4017);
  });

  test('a skipped turn is not a Jail attempt', () => {
    let s = edit(game(), (d) => {
      const p = d.players[1] as { inJail: boolean; position: number; skipNextTurn: boolean };
      p.inJail = true;
      p.position = JAIL;
      p.skipNextTurn = true;
    });
    s = endTurn(rollTo(s, REST).state);
    expect(s.flow.pending).toEqual({ kind: 'vacationSkip' });
    s = act(s, { type: 'acknowledge' });
    s = endTurn(rollTo(s, REST).state);
    expect(s.turn.currentPlayerIndex).toBe(1);
    expect(s.flow.pending).toEqual({ kind: 'jailChoice' });
    expect(s.players[1]?.jailAttempts).toBe(0);
  });
});
