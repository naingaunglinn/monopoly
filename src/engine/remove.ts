// Removing a player (online host control, DECISIONS D60): they leave the game bankrupt to the bank
// (spec 7.4 with the bank as creditor). Whatever was waiting on them is resolved first, so the game
// always continues from a valid state:
// - a trade they are part of is cancelled;
// - in an auction they fold, and a high bid they hold is withdrawn;
// - rent or a company roll owed to them is cancelled (the property goes back to the bank);
// - on their own turn, the turn ends: a drawn card is discarded, an auction they started ends
//   unsold, and the turn passes to the next player once any payments are settled.
// In a Quick game this is the first bankruptcy, so the game ends (spec section 8).
import { cancelAuction, withdrawBidder } from './auction.js';
import { discardCard } from './cards.js';
import { type Ctx, emit } from './core.js';
import { goBankrupt, settleDebts } from './debt.js';
import { afterResolution } from './phases.js';

export function removePlayer(c: Ctx, playerId: number): void {
  const s = c.s;
  const wasCurrent = playerId === s.turn.currentPlayerIndex;
  emit(c, { type: 'playerRemoved', player: playerId });

  const trade = s.flow.trade;
  if (trade && (trade.from === playerId || trade.to === playerId)) {
    s.flow.trade = null;
    emit(c, { type: 'tradeCancelled', from: trade.from, to: trade.to });
  }
  // A notice about them (Vacation) no longer matters.
  s.flow.notices = s.flow.notices.filter((n) => n.player !== playerId);

  const pending = s.flow.pending;
  if (wasCurrent) {
    if (pending?.kind === 'card') discardCard(s, pending.cardId);
    if (pending?.kind === 'auction') cancelAuction(c, pending.auction);
    s.flow.pending = s.flow.phase === 'Debt' ? s.flow.pending : null;
  } else if (pending?.kind === 'auction') {
    withdrawBidder(c, pending.auction, playerId);
  }

  const headBefore = s.flow.debts[0];
  const inDebt = s.flow.phase === 'Debt';
  const rentToThem = s.flow.pending?.kind === 'rent' && s.flow.pending.rent.creditor === playerId;
  const companyOfTheirs = s.flow.pending?.kind === 'companyRoll' && s.flow.pending.owner === playerId;

  goBankrupt(c, playerId, null);
  if (isOver(c)) return;

  if (wasCurrent) {
    // The turn ends once the payments still queued (owed by others) are settled.
    s.flow.resume = { kind: 'passTurn' };
    settleDebts(c);
    return;
  }
  if (inDebt) {
    // Their debts are void now; continue with the next payment, or the stored continuation.
    if (s.flow.debts[0] !== headBefore || s.flow.debts.length === 0) settleDebts(c);
    return;
  }
  if (rentToThem || companyOfTheirs) {
    s.flow.pending = null;
    afterResolution(c);
  }
}

/** Read through a function so TypeScript does not keep a phase narrowed across mutations. */
function isOver(c: Ctx): boolean {
  return c.s.flow.phase === 'GameOver';
}
