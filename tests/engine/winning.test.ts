import { describe, expect, test } from 'vitest';
import { computeWinners, legalActions, netWorth, ranking } from '../../src/engine';
import { act, dbg, edit, game, levels, own, rollTo, run, setCash } from './helpers';

const CAIRO = 12;
const ALEXANDRIA = 14;

describe('winning', () => {
  test('Normal: the last player left wins', () => {
    const s = rollTo(setCash(own(game({ mode: 'normal' }), CAIRO, 1), 0, 10), CAIRO).state;
    const { state, events } = run(s, { type: 'payRent' });
    expect(state.flow.phase).toBe('GameOver');
    expect(state.meta).toMatchObject({ winner: [1], endReason: 'lastPlayer' });
    expect(events.at(-1)).toMatchObject({ type: 'gameOver', winners: [1], reason: 'lastPlayer' });
    // The bankruptcy notice is shown first, then nothing is left to do.
    expect(legalActions(state)).toEqual([{ type: 'acknowledge' }]);
    expect(legalActions(act(state, { type: 'acknowledge' }))).toEqual([]);
  });

  test('Quick: the game ends when the round limit is completed', () => {
    let s = edit(own(game({ mode: 'quick', roundLimit: 30 }), 9, 0), (d) => {
      d.turn.roundNumber = 30;
    });
    s = act(rollTo(s, 34).state, { type: 'endTurn' });
    expect(s.flow.phase).toBe('AwaitRoll');
    expect(s.turn.currentPlayerIndex).toBe(1);
    const { state, events } = run(rollTo(s, 34).state, { type: 'endTurn' });
    expect(state.flow.phase).toBe('GameOver');
    expect(state.meta.endReason).toBe('roundLimit');
    expect(state.meta.winner).toEqual([0]);
    expect(events.some((e) => e.type === 'roundStarted')).toBe(false);
  });

  test('rounds advance each time the turn order wraps to the first player', () => {
    let s = game({ playerCount: 3 });
    expect(s.turn.roundNumber).toBe(1);
    for (let i = 0; i < 3; i++) s = act(rollTo(s, 34).state, { type: 'endTurn' });
    expect(s.turn.roundNumber).toBe(2);
    expect(s.turn.currentPlayerIndex).toBe(0);
  });

  test('Quick: the first bankruptcy ends the game; the bankrupt player ranks last', () => {
    const s = rollTo(setCash(own(game({ playerCount: 3, mode: 'quick' }), CAIRO, 1), 0, 10), CAIRO).state;
    const { state } = run(s, { type: 'payRent' });
    expect(state.flow.phase).toBe('GameOver');
    expect(state.meta.endReason).toBe('bankruptcy');
    expect(state.meta.winner).toEqual([1]);
    const rows = ranking(state);
    expect(rows.map((r) => [r.player, r.rank, r.bankrupt])).toEqual([
      [1, 1, false],
      [2, 2, false],
      [0, 3, true],
    ]);
  });

  test('net worth: cash + prices + buildings (hotel = 6 × house cost); mortgaged at half', () => {
    let s = levels(own(game(), [CAIRO, ALEXANDRIA], 0), [
      [CAIRO, 2],
      [ALEXANDRIA, 2],
    ]);
    s = setCash(s, 0, 1000);
    expect(netWorth(s, 0)).toMatchObject({ cash: 1000, cities: 360, buildings: 200, total: 1560 });
    s = levels(s, [
      [CAIRO, 5],
      [ALEXANDRIA, 5],
    ]);
    expect(netWorth(s, 0).buildings).toBe(600);
    s = dbg(own(s, [9, 11], 0), { op: 'setMortgaged', space: 9, mortgaged: true });
    expect(netWorth(s, 0)).toMatchObject({ airports: 55, companies: 200, total: 1000 + 360 + 600 + 55 + 200 });
  });

  test('ties: more cash wins; still tied, the win is shared', () => {
    let s = setCash(own(game(), 9, 0), 0, 3890);
    expect(netWorth(s, 0).total).toBe(4000);
    expect(netWorth(s, 1).total).toBe(4000);
    expect(computeWinners(s)).toEqual([1]);
    s = game();
    expect(computeWinners(s)).toEqual([0, 1]);
    expect(ranking(s).map((r) => r.rank)).toEqual([1, 1]);
  });
});
