// Net worth, winners and the results ranking (spec section 8).
import { BALANCE, mortgageValue } from '../data/balance.js';
import { AIRPORT_BY_SPACE, CITY_BY_SPACE, COMPANY_BY_SPACE } from '../data/board.js';
import type { GameState } from './types.js';

export interface NetWorth {
  cash: number;
  /** Cities at purchase price (mortgaged at half). */
  cities: number;
  airports: number;
  companies: number;
  /** House cost per house; a hotel counts as 6 × house cost. */
  buildings: number;
  total: number;
  cityCount: number;
  airportCount: number;
  companyCount: number;
}

export function netWorth(s: GameState, playerId: number): NetWorth {
  const player = s.players[playerId];
  const nw: NetWorth = {
    cash: player?.cash ?? 0,
    cities: 0,
    airports: 0,
    companies: 0,
    buildings: 0,
    total: 0,
    cityCount: 0,
    airportCount: 0,
    companyCount: 0,
  };
  s.properties.forEach((ps, space) => {
    if (!ps || ps.owner !== playerId) return;
    const city = CITY_BY_SPACE.get(space);
    const airport = AIRPORT_BY_SPACE.get(space);
    const company = COMPANY_BY_SPACE.get(space);
    const price = city?.price ?? airport?.price ?? company?.price ?? 0;
    const value = ps.mortgaged ? mortgageValue(price) : price;
    if (city) {
      nw.cities += value;
      nw.cityCount += 1;
      nw.buildings +=
        ps.level === BALANCE.hotelLevel ? city.houseCost * BALANCE.netWorthHotelHouseCosts : city.houseCost * ps.level;
    } else if (airport) {
      nw.airports += value;
      nw.airportCount += 1;
    } else if (company) {
      nw.companies += value;
      nw.companyCount += 1;
    }
  });
  nw.total = nw.cash + nw.cities + nw.airports + nw.companies + nw.buildings;
  return nw;
}

export interface RankRow {
  player: number;
  rank: number;
  worth: NetWorth;
  bankrupt: boolean;
  winner: boolean;
}

/**
 * Living players by net worth, then cash (equal on both = shared rank); bankrupt players last,
 * the most recently eliminated first.
 */
export function ranking(s: GameState): RankRow[] {
  const winners = new Set(s.meta.winner ?? []);
  const living = s.players
    .filter((p) => !p.bankrupt)
    .map((p) => ({ player: p.id, worth: netWorth(s, p.id) }))
    .sort((a, b) => b.worth.total - a.worth.total || b.worth.cash - a.worth.cash || a.player - b.player);
  const rows: RankRow[] = [];
  living.forEach((row, i) => {
    const prev = rows[i - 1];
    const tied = prev !== undefined && prev.worth.total === row.worth.total && prev.worth.cash === row.worth.cash;
    rows.push({ ...row, rank: tied ? prev.rank : i + 1, bankrupt: false, winner: winners.has(row.player) });
  });
  const out = s.players
    .filter((p) => p.bankrupt)
    .sort((a, b) => (b.bankruptOrder ?? 0) - (a.bankruptOrder ?? 0));
  out.forEach((p) => {
    rows.push({ player: p.id, worth: netWorth(s, p.id), rank: rows.length + 1, bankrupt: true, winner: false });
  });
  return rows;
}

/** Normal: the survivor. Quick: highest net worth, then more cash; still tied = shared win. */
export function computeWinners(s: GameState): number[] {
  const living = s.players.filter((p) => !p.bankrupt);
  if (living.length <= 1) return living.map((p) => p.id);
  const scored = living.map((p) => ({ id: p.id, worth: netWorth(s, p.id) }));
  let best = scored[0] as (typeof scored)[number];
  for (const row of scored) {
    if (row.worth.total > best.worth.total || (row.worth.total === best.worth.total && row.worth.cash > best.worth.cash)) {
      best = row;
    }
  }
  return scored
    .filter((row) => row.worth.total === best.worth.total && row.worth.cash === best.worth.cash)
    .map((row) => row.id);
}
