// Rent (spec 5.6). Event modifiers apply last; results are rounded to whole dollars.
import { BALANCE, roundMoney } from '../data/balance.js';
import { AIRPORT_BY_SPACE, CITY_BY_SPACE, COMPANY_BY_SPACE } from '../data/board.js';
import type { ModifierType } from '../data/cardTypes.js';
import { airportsOwnedBy, ownsCountry } from './core.js';
import type { Dice, GameState, RentCalc } from './types.js';

export function modifierFactor(s: GameState, type: ModifierType): number | null {
  return s.flow.modifiers.find((m) => m.type === type)?.factor ?? null;
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
  const factor = modifierFactor(s, 'cityRent');
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
  const ladderRent = BALANCE.airportRent[owned - 1] as number;
  const factor = modifierFactor(s, 'airportRent');
  return { amount: applyFactor(ladderRent, factor), calc: { kind: 'airport', owned, ladderRent, factor } };
}

/** Company rent: total of two fresh dice × the company's multiplier. */
export function companyRent(s: GameState, space: number, dice: Dice): RentQuote {
  const company = COMPANY_BY_SPACE.get(space);
  if (!company) throw new Error(`No company at ${space}`);
  const total = dice[0] + dice[1];
  const factor = modifierFactor(s, 'companyRent');
  return {
    amount: applyFactor(total * company.multiplier, factor),
    calc: { kind: 'company', dice, total, multiplier: company.multiplier, factor },
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
