// Auctions (spec 7.1). Bidding goes clockwise from the player after the lander; the lander bids
// last. A fold is final; a bidder who cannot beat the high bid folds automatically.
import { BALANCE } from '../data/balance';
import { type Ctx, changeCash, emit, playerById, playersInTurnOrderFrom, prop } from './core';
import { afterResolution } from './phases';
import type { AuctionState } from './types';

export function startAuction(c: Ctx, space: number): void {
  const s = c.s;
  const lander = s.turn.currentPlayerIndex;
  const order = playersInTurnOrderFrom(s, (lander + 1) % s.players.length).map((p) => p.id);
  const auction: AuctionState = {
    space,
    order,
    active: order.slice(),
    current: order[0] as number,
    highBid: 0,
    highBidder: null,
  };
  s.flow.phase = 'Auction';
  s.flow.pending = { kind: 'auction', auction };
  emit(c, { type: 'auctionStarted', space, lander });
  advance(c, auction, null);
}

/** The lowest legal bid right now. */
export function minimumBid(auction: AuctionState): number {
  return Math.max(BALANCE.auctionMinBid, auction.highBid + 1);
}

function nextActiveAfter(a: AuctionState, after: number | null): number {
  if (after === null) return a.active[0] as number;
  const start = a.order.indexOf(after);
  for (let k = 1; k <= a.order.length; k++) {
    const candidate = a.order[(start + k) % a.order.length] as number;
    if (a.active.includes(candidate)) return candidate;
  }
  return a.active[0] as number;
}

/** Moves to the next bidder, auto-folding anyone who cannot afford a bid, or ends the auction. */
function advance(c: Ctx, a: AuctionState, after: number | null): void {
  let last = after;
  for (;;) {
    if (a.active.length === 0) {
      finish(c, a);
      return;
    }
    if (a.active.length === 1 && a.active[0] === a.highBidder) {
      finish(c, a);
      return;
    }
    const candidate = nextActiveAfter(a, last);
    if (playerById(c.s, candidate).cash < minimumBid(a)) {
      a.active = a.active.filter((id) => id !== candidate);
      emit(c, { type: 'folded', player: candidate, auto: true });
      last = candidate;
      continue;
    }
    a.current = candidate;
    return;
  }
}

function finish(c: Ctx, a: AuctionState): void {
  const s = c.s;
  if (a.highBidder !== null) {
    changeCash(c, a.highBidder, -a.highBid, 'auction', { space: a.space });
    prop(s, a.space).owner = a.highBidder;
    emit(c, { type: 'auctionWon', player: a.highBidder, space: a.space, price: a.highBid });
  } else {
    emit(c, { type: 'auctionUnsold', space: a.space });
  }
  s.flow.pending = null;
  afterResolution(c);
}

export function placeBid(c: Ctx, a: AuctionState, amount: number): void {
  const bidder = a.current;
  a.highBid = amount;
  a.highBidder = bidder;
  emit(c, { type: 'bid', player: bidder, amount });
  advance(c, a, bidder);
}

export function foldBid(c: Ctx, a: AuctionState): void {
  const bidder = a.current;
  a.active = a.active.filter((id) => id !== bidder);
  emit(c, { type: 'folded', player: bidder, auto: false });
  advance(c, a, bidder);
}
