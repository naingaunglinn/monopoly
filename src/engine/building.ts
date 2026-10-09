// Building (5.8, the house rule: in the country you land in, D98), selling (5.9) and mortgages (5.14).
import { BALANCE, mortgageValue, unmortgageCost } from '../data/balance.js';
import { CITY_BY_SPACE, propertyName, propertyPrice } from '../data/board.js';
import { COUNTRY_BY_ID } from '../data/countries.js';
import { discardCard } from './cards.js';
import {
  type Ctx,
  changeCash,
  countryHasBuildings,
  countryLevels,
  countryOf,
  emit,
  firstMortgagedCity,
  makeError,
  ownsCountry,
  playerById,
  prop,
} from './core.js';
import { buildCost, sellRefund } from './rent.js';
import type { EngineError, GameState } from './types.js';

export interface BuildQuote {
  /** Level after building (5 = hotel). */
  nextLevel: number;
  /** Cash actually charged (0 when a Free House card pays). */
  cost: number;
  /** Price before any Free House card. */
  listCost: number;
  voucher: boolean;
}

export function buildQuote(s: GameState, playerId: number, space: number): BuildQuote {
  const ps = prop(s, space);
  const nextLevel = ps.level + 1;
  const listCost = buildCost(s, space, nextLevel);
  const voucher = nextLevel < BALANCE.hotelLevel && playerById(s, playerId).houseVouchers.length > 0;
  return { nextLevel, cost: voucher ? 0 : listCost, listCost, voucher };
}

/**
 * Why the player may not build the next level on this city right now, or null when allowed.
 * The checks follow the order a player would fix them in.
 */
export function buildBlocker(s: GameState, playerId: number, space: number): EngineError | null {
  const city = CITY_BY_SPACE.get(space);
  if (!city) return makeError('notCity');
  const ps = prop(s, space);
  const country = COUNTRY_BY_ID[city.country];
  if (ps.owner !== playerId) return makeError('notOwner', { name: city.name });
  const player = playerById(s, playerId);
  // Only during the move that landed on a city of this country, and then on any of its cities (D98).
  const landed = s.turn.landedCity;
  if (
    s.turn.currentPlayerIndex !== playerId ||
    landed === null ||
    player.position !== landed ||
    CITY_BY_SPACE.get(landed)?.country !== city.country
  ) {
    return makeError('notLandedHere', { country: country.name });
  }
  if (!ownsCountry(s, playerId, city.country)) return makeError('countryIncomplete', { country: country.name });
  const mortgaged = firstMortgagedCity(s, city.country);
  if (mortgaged !== null) {
    return makeError('countryMortgaged', { name: propertyName(mortgaged), country: country.name });
  }
  if (ps.level >= BALANCE.hotelLevel) return makeError('hasHotel', { name: city.name });
  // Even building: build only on a city at the lowest level in its country.
  if (ps.level > Math.min(...countryLevels(s, city.country))) {
    return makeError('evenBuild', { country: country.name });
  }
  const quote = buildQuote(s, playerId, space);
  if (player.cash < quote.cost) return makeError('notEnoughCash', { needed: quote.cost, have: player.cash });
  return null;
}

export function doBuild(c: Ctx, playerId: number, space: number): void {
  const s = c.s;
  const p = playerById(s, playerId);
  const ps = prop(s, space);
  const quote = buildQuote(s, playerId, space);
  if (quote.voucher) {
    const cardId = p.houseVouchers.shift() as string;
    discardCard(s, cardId);
  }
  if (quote.cost > 0) changeCash(c, playerId, -quote.cost, 'build', { space });
  ps.level = quote.nextLevel;
  if (quote.nextLevel === BALANCE.hotelLevel) s.meta.stats.hotelsBuilt += 1;
  else s.meta.stats.housesBuilt += 1;
  emit(c, { type: 'built', player: playerId, space, level: ps.level, cost: quote.cost, voucher: quote.voucher });
}

export function sellBlocker(s: GameState, playerId: number, space: number): EngineError | null {
  const city = CITY_BY_SPACE.get(space);
  if (!city) return makeError('notCity');
  const ps = prop(s, space);
  if (ps.owner !== playerId) return makeError('notOwner', { name: city.name });
  if (ps.level === 0) return makeError('noBuildings', { name: city.name });
  // Even rule in reverse: sell from the highest city first.
  if (ps.level < Math.max(...countryLevels(s, city.country))) {
    return makeError('evenSell', { country: COUNTRY_BY_ID[city.country].name });
  }
  return null;
}

export function doSell(c: Ctx, playerId: number, space: number): void {
  const ps = prop(c.s, space);
  const refund = sellRefund(space, ps.level);
  ps.level -= 1;
  changeCash(c, playerId, refund, 'sell', { space });
  emit(c, { type: 'buildingSold', player: playerId, space, level: ps.level, refund });
}

export function mortgageBlocker(s: GameState, playerId: number, space: number): EngineError | null {
  const ps = s.properties[space];
  if (!ps) return makeError('notProperty');
  const name = propertyName(space);
  if (ps.owner !== playerId) return makeError('notOwner', { name });
  if (ps.mortgaged) return makeError('alreadyMortgaged', { name });
  const country = countryOf(space);
  if (country !== null && countryHasBuildings(s, country)) {
    return makeError('countryHasBuildings', { country: COUNTRY_BY_ID[country].name });
  }
  return null;
}

export function doMortgage(c: Ctx, playerId: number, space: number): void {
  const amount = mortgageValue(propertyPrice(space));
  prop(c.s, space).mortgaged = true;
  changeCash(c, playerId, amount, 'mortgage', { space });
  emit(c, { type: 'mortgaged', player: playerId, space, amount });
}

export function unmortgageBlocker(s: GameState, playerId: number, space: number): EngineError | null {
  const ps = s.properties[space];
  if (!ps) return makeError('notProperty');
  const name = propertyName(space);
  if (ps.owner !== playerId) return makeError('notOwner', { name });
  if (!ps.mortgaged) return makeError('notMortgaged', { name });
  const cost = unmortgageCost(propertyPrice(space));
  const cash = playerById(s, playerId).cash;
  if (cash < cost) return makeError('notEnoughCash', { needed: cost, have: cash });
  return null;
}

export function doUnmortgage(c: Ctx, playerId: number, space: number): void {
  const cost = unmortgageCost(propertyPrice(space));
  prop(c.s, space).mortgaged = false;
  changeCash(c, playerId, -cost, 'unmortgage', { space });
  emit(c, { type: 'unmortgaged', player: playerId, space, cost });
}
