// Rent (spec 5.6). Event modifiers apply last; results are rounded to whole dollars. The map in
// play sets the airport (transport) ladder and the company multipliers (RULES, D101).
import { BALANCE, roundMoney } from '../data/balance.js';
import { AIRPORT_BY_SPACE, CITY_BY_SPACE, COMPANY_BY_SPACE, RULES } from '../data/board.js';
import type { ModifierType } from '../data/cardTypes.js';
import type { CountryId } from '../data/countries.js';
import type { MyanmarTransport } from '../data/myanmar.js';
import { MYANMAR_CARD_BY_ID } from '../data/myanmarCards.js';
import { airportsOwnedBy, companiesOwnedBy, ownsCountry } from './core.js';
import type { Dice, GameState, RentCalc } from './types.js';

export function modifierFactor(s: GameState, type: ModifierType): number | null {
  return s.flow.modifiers.find((m) => m.type === type)?.factor ?? null;
}

/** Two factors together (null when neither applies). */
function combine(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 1) * (b ?? 1);
}

/** Myanmar map: the regional rent modifiers that cover this region (tourist season, rice prices). */
function groupFactor(s: GameState, country: CountryId): number | null {
  let factor: number | null = null;
  for (const m of s.flow.modifiers) {
    if (m.type !== 'groupRent') continue;
    const effect = MYANMAR_CARD_BY_ID.get(m.cardId)?.effect;
    if (effect?.type === 'groupRent' && effect.groups.includes(country)) factor = (factor ?? 1) * m.factor;
  }
  return factor;
}

/** Myanmar map: a transport modifier that covers this space's kind (border trade closed). */
function transportFactor(s: GameState, space: number): number | null {
  const kind = (AIRPORT_BY_SPACE.get(space) as MyanmarTransport | undefined)?.kind;
  if (!kind) return null;
  let factor: number | null = null;
  for (const m of s.flow.modifiers) {
    if (m.type !== 'transportRent') continue;
    const effect = MYANMAR_CARD_BY_ID.get(m.cardId)?.effect;
    if (effect?.type === 'transportClosed' && effect.kind === kind) factor = (factor ?? 1) * m.factor;
  }
  return factor;
}

function applyFactor(amount: number, factor: number | null): number {
  return factor === null ? amount : roundMoney(amount * factor);
}

export interface RentQuote {
  amount: number;
  calc: RentCalc;
}

/** Rent for a city with its current owner, ignoring the mortgage (callers check that). */
export function cityRent(s: GameState, space: number): RentQuote {
  const city = CITY_BY_SPACE.get(space);
  const p = s.properties[space];
  if (!city || !p || p.owner === null) throw new Error(`No owned city at ${space}`);
  const factor = combine(modifierFactor(s, 'cityRent'), groupFactor(s, city.country));
  if (!ownsCountry(s, p.owner, city.country)) {
    return { amount: applyFactor(city.baseRent, factor), calc: { kind: 'cityBase', baseRent: city.baseRent, factor } };
  }
  const multiplier = BALANCE.cityRentMultipliers[p.level] as number;
  return {
    amount: applyFactor(city.baseRent * multiplier, factor),
    calc: { kind: 'cityComplete', baseRent: city.baseRent, level: p.level, multiplier, factor },
  };
}

/** Airport rent by the number of airports the owner holds (mortgaged ones count). */
export function airportRent(s: GameState, space: number): RentQuote {
  const p = s.properties[space];
  if (!AIRPORT_BY_SPACE.has(space) || !p || p.owner === null) throw new Error(`No owned airport at ${space}`);
  const owned = airportsOwnedBy(s, p.owner);
  const ladderRent = RULES.airportRent[owned - 1] as number;
  const factor = combine(modifierFactor(s, 'airportRent'), transportFactor(s, space));
  return { amount: applyFactor(ladderRent, factor), calc: { kind: 'airport', owned, ladderRent, factor } };
}

/**
 * Company rent: total of two fresh dice × the company's multiplier (World), or × the multiplier for
 * the number of companies the owner holds (Myanmar: 25, 50, 100, 200).
 */
export function companyRent(s: GameState, space: number, dice: Dice): RentQuote {
  const company = COMPANY_BY_SPACE.get(space);
  if (!company) throw new Error(`No company at ${space}`);
  const total = dice[0] + dice[1];
  const owner = s.properties[space]?.owner ?? null;
  const multiplier =
    RULES.companyMultipliers && owner !== null
      ? (RULES.companyMultipliers[companiesOwnedBy(s, owner) - 1] ?? company.multiplier)
      : company.multiplier;
  const factor = modifierFactor(s, 'companyRent');
  return {
    amount: applyFactor(total * multiplier, factor),
    calc: { kind: 'company', dice, total, multiplier, factor },
  };
}

/**
 * What landing on an owned property costs right now (shown on tiles).
 * Companies depend on dice, so they return null; mortgaged properties return 0.
 */
export function displayedRent(s: GameState, space: number): number | null {
  const p = s.properties[space];
  if (!p || p.owner === null) return null;
  if (p.mortgaged) return 0;
  if (CITY_BY_SPACE.has(space)) return cityRent(s, space).amount;
  if (AIRPORT_BY_SPACE.has(space)) return airportRent(s, space).amount;
  return null;
}

/** Build cost of the next level on a city, before any Free House card (modifier applied). */
export function buildCost(s: GameState, space: number, nextLevel: number): number {
  const city = CITY_BY_SPACE.get(space);
  if (!city) throw new Error(`No city at ${space}`);
  const base = nextLevel === BALANCE.hotelLevel ? city.houseCost * BALANCE.hotelCostMultiplier : city.houseCost;
  return applyFactor(base, modifierFactor(s, 'buildCost'));
}

/** Refund for selling the top level of a city (5.9). Refunds use the printed house cost. */
export function sellRefund(space: number, level: number): number {
  const city = CITY_BY_SPACE.get(space);
  if (!city) throw new Error(`No city at ${space}`);
  if (level === BALANCE.hotelLevel) return city.houseCost * BALANCE.hotelRefundMultiplier;
  return roundMoney((city.houseCost * BALANCE.houseRefundPercent) / 100);
}
