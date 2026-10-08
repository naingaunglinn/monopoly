import { describe, expect, test } from 'vitest';
import { decisionMaker, legalActions } from '../../src/engine';
import { act, cashOf, eventsOf, fail, game, rollTo, run, setCash, totalCash } from './helpers';

const MEXICO_AIRPORT = 9;

function auctionGame() {
  const s = rollTo(game({ playerCount: 3 }), MEXICO_AIRPORT).state;
  return act(s, { type: 'decline' });
}

function auction(s: ReturnType<typeof auctionGame>) {
  if (s.flow.pending?.kind !== 'auction') throw new Error('no auction');
  return s.flow.pending.auction;
}

describe('auction', () => {
  test('bidding starts with the player after the lander; the lander bids last', () => {
    const s = auctionGame();
    expect(auction(s).order).toEqual([1, 2, 0]);
    expect(auction(s).current).toBe(1);
    expect(decisionMaker(s)).toBe(1);
  });

  test('raises, folds and the winner pays the bank', () => {
    let s = auctionGame();
    const before = totalCash(s);
    s = act(s, { type: 'bid', amount: 10 });
    expect(auction(s).current).toBe(2);
    s = act(s, { type: 'bid', amount: 60 });
    s = act(s, { type: 'bid', amount: 160 });
    expect(auction(s)).toMatchObject({ highBid: 160, highBidder: 0, current: 1 });
    s = act(s, { type: 'fold' });
    expect(auction(s).current).toBe(2);
    const { state, events } = run(s, { type: 'fold' });
    expect(eventsOf(events, 'auctionWon')[0]).toMatchObject({ player: 0, price: 160 });
    expect(state.properties[MEXICO_AIRPORT]?.owner).toBe(0);
    expect(cashOf(state, 0)).toBe(4000 - 160);
    // The bank receives the money: nobody else gains.
    expect(totalCash(state)).toBe(before - 160);
    expect(state.flow.phase).toBe('AwaitEndTurn');
  });

  test('a fold is final', () => {
    let s = auctionGame();
    s = act(s, { type: 'fold' }); // player 1 out
    s = act(s, { type: 'bid', amount: 10 }); // player 2
    expect(auction(s).current).toBe(0);
    s = act(s, { type: 'bid', amount: 20 }); // player 0
    expect(auction(s).current).toBe(2);
    expect(auction(s).active).toEqual([2, 0]);
  });

  test('a player who cannot afford the next bid folds automatically', () => {
    let s = rollTo(setCash(game({ playerCount: 3 }), 2, 5), MEXICO_AIRPORT).state;
    s = act(s, { type: 'decline' });
    const { state, events } = run(s, { type: 'bid', amount: 10 });
    expect(eventsOf(events, 'folded')[0]).toMatchObject({ player: 2, auto: true });
    expect(auction(state).current).toBe(0);
  });

  test('if everyone folds with no bid the property stays unowned', () => {
    let s = auctionGame();
    s = act(s, { type: 'fold' }, { type: 'fold' });
    const { state, events } = run(s, { type: 'fold' });
    expect(eventsOf(events, 'auctionUnsold')).toHaveLength(1);
    expect(state.properties[MEXICO_AIRPORT]?.owner).toBeNull();
    expect(state.flow.phase).toBe('AwaitEndTurn');
  });

  test('the last bidder left may still open the bidding', () => {
    let s = auctionGame();
    s = act(s, { type: 'fold' }, { type: 'fold' });
    expect(auction(s).current).toBe(0);
    s = act(s, { type: 'bid', amount: 1 });
    expect(s.properties[MEXICO_AIRPORT]?.owner).toBe(0);
    expect(cashOf(s, 0)).toBe(3999);
  });

  test('bids must beat the high bid, start at $1 and stay within cash', () => {
    let s = auctionGame();
    expect(fail(s, { type: 'bid', amount: 0 }).code).toBe('bidTooLow');
    expect(fail(s, { type: 'bid', amount: 4001 }).code).toBe('bidTooHigh');
    expect(fail(s, { type: 'bid', amount: 10.5 }).code).toBe('invalidAmount');
    s = act(s, { type: 'bid', amount: 10 });
    expect(fail(s, { type: 'bid', amount: 10 }).code).toBe('bidTooLow');
    const bids = legalActions(s).filter((a) => a.type === 'bid').map((a) => (a.type === 'bid' ? a.amount : 0));
    expect(bids).toEqual([11, 20, 60, 110]);
  });

  test('jailed players still bid', () => {
    let s = game({ playerCount: 3 });
    s = { ...s, players: s.players.map((p) => (p.id === 1 ? { ...p, inJail: true, position: 17 } : p)) };
    s = act(rollTo(s, MEXICO_AIRPORT).state, { type: 'decline' });
    expect(auction(s).current).toBe(1);
  });
});
