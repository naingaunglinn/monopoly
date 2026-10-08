// Trading (spec 7.2): one partner, two columns (give / get) of properties, Get Out of Jail cards
// and cash. Cities in a country with buildings cannot move. An accepted trade applies in one step.
import { propertyName } from '../data/board.js';
import { COUNTRY_BY_ID } from '../data/countries.js';
import {
  type Ctx,
  countryHasBuildings,
  countryOf,
  emit,
  makeError,
  transfer,
} from './core.js';
import type { EngineError, GameState, TradeOffer, TradeSide } from './types.js';

function isWholeAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

function sideBlocker(s: GameState, side: TradeSide, ownerId: number): EngineError | null {
  const owner = s.players[ownerId];
  if (!owner) return makeError('tradeInvalidPlayer');
  if (!Array.isArray(side.properties) || !isWholeAmount(side.cash) || !isWholeAmount(side.jailCards)) {
    return makeError('invalidAmount');
  }
  for (const space of side.properties) {
    const ps = s.properties[space];
    if (!ps) return makeError('notProperty');
    if (ps.owner !== ownerId) {
      return makeError('tradeNotOwned', { name: propertyName(space), player: owner.name });
    }
    const country = countryOf(space);
    if (country !== null && countryHasBuildings(s, country)) {
      return makeError('tradeBuildings', { country: COUNTRY_BY_ID[country].name, name: propertyName(space) });
    }
  }
  if (side.cash > owner.cash) return makeError('tradeCash', { player: owner.name, amount: side.cash });
  if (side.jailCards > owner.jailCards.length) return makeError('tradeCards', { player: owner.name });
  return null;
}

/** Why this offer is not valid right now, or null. Who may propose is checked by the reducer. */
export function tradeBlocker(s: GameState, offer: TradeOffer): EngineError | null {
  if (!offer || typeof offer !== 'object' || !offer.give || !offer.get) return makeError('invalidAction');
  const from = s.players[offer.from];
  const to = s.players[offer.to];
  if (!from || !to || offer.from === offer.to || from.bankrupt || to.bankrupt) {
    return makeError('tradeInvalidPlayer');
  }
  const all = [...(offer.give.properties ?? []), ...(offer.get.properties ?? [])];
  if (new Set(all).size !== all.length) return makeError('invalidAction');
  const empty =
    all.length === 0 &&
    offer.give.cash === 0 &&
    offer.get.cash === 0 &&
    offer.give.jailCards === 0 &&
    offer.get.jailCards === 0;
  if (empty) return makeError('tradeEmpty');
  return sideBlocker(s, offer.give, offer.from) ?? sideBlocker(s, offer.get, offer.to);
}

export function applyTrade(c: Ctx, offer: TradeOffer): void {
  const s = c.s;
  for (const space of offer.give.properties) (s.properties[space] as { owner: number | null }).owner = offer.to;
  for (const space of offer.get.properties) (s.properties[space] as { owner: number | null }).owner = offer.from;
  transfer(c, offer.from, offer.to, offer.give.cash, 'trade');
  transfer(c, offer.to, offer.from, offer.get.cash, 'trade');
  const from = s.players[offer.from];
  const to = s.players[offer.to];
  if (from && to) {
    const given = from.jailCards.splice(0, offer.give.jailCards);
    const received = to.jailCards.splice(0, offer.get.jailCards);
    to.jailCards.push(...given);
    from.jailCards.push(...received);
  }
  emit(c, { type: 'tradeAccepted', offer });
}

export function emptySide(): TradeSide {
  return { properties: [], cash: 0, jailCards: 0 };
}
