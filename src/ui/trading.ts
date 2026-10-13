// Trading on this device (spec 7.2, D99): who can make an offer from here, and where a negotiation
// stands. Any player may make an offer while the game is between decisions; the engine decides.
import { decisionMaker, freeActor, type GameState, type TradeOffer, type TradeSide } from '../engine';
import { canAct } from './store';

/** The players this device can make offers for: online its own seats, on one shared device everyone. */
export function tradersHere(s: GameState): number[] {
  return s.players.filter((p) => !p.bankrupt && canAct(p.id)).map((p) => p.id);
}

/** Who this device offers as unless the player picks someone else: the one acting now, else the current player. */
export function defaultTrader(s: GameState, traders: number[]): number | null {
  for (const id of [freeActor(s), decisionMaker(s), s.turn.currentPlayerIndex]) {
    if (id !== null && traders.includes(id)) return id;
  }
  return traders[0] ?? null;
}

/** True when this device can open the trade builder: a living player of its own and someone to trade with. */
export function canOfferHere(s: GameState): boolean {
  if (s.flow.phase === 'GameOver') return false;
  return tradersHere(s).length > 0 && s.players.filter((p) => !p.bankrupt).length > 1;
}

/** What `player` puts in under this offer. */
export function sideOf(offer: TradeOffer, player: number): TradeSide {
  return offer.from === player ? offer.give : offer.get;
}

/**
 * The negotiation on the table: `id` is the log number of the first offer, `round` how many
 * counter-offers followed it (0 for the first offer).
 */
export function negotiation(s: GameState): { id: number; round: number } {
  let round = 0;
  for (let i = s.meta.log.length - 1; i >= 0; i--) {
    const entry = s.meta.log[i];
    if (!entry) continue;
    if (entry.event.type === 'tradeCountered') round++;
    else if (entry.event.type === 'tradeProposed') return { id: entry.seq, round };
  }
  return { id: -1, round };
}
