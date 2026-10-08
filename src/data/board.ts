// The fixed 80-space board (spec section 3). Property spaces come from the city, airport and
// company tables; the 20 special spaces are listed here. Indices run clockwise from World Start.
import { AIRPORTS, type AirportData } from './airports.js';
import { BOARD_SIZE } from './balance.js';
import { CITIES, type CityData } from './cities.js';
import { COMPANIES, type CompanyData } from './companies.js';
import { COUNTRIES, type CountryId } from './countries.js';

export type SpecialType =
  | 'start'
  | 'chance'
  | 'event'
  | 'tax'
  | 'jail'
  | 'goToJail'
  | 'vacation'
  | 'freeParking';

export type SpaceType = 'city' | 'airport' | 'company' | SpecialType;
export type TaxKind = 'income' | 'luxury';
export type PropertyKind = 'city' | 'airport' | 'company';

export type SpaceData =
  | { index: number; type: 'city'; city: CityData }
  | { index: number; type: 'airport'; airport: AirportData }
  | { index: number; type: 'company'; company: CompanyData }
  | { index: number; type: 'tax'; tax: TaxKind }
  | { index: number; type: Exclude<SpecialType, 'tax'> };

const SPECIALS: Readonly<Record<number, SpecialType | `tax:${TaxKind}`>> = {
  0: 'start',
  2: 'chance',
  5: 'tax:income',
  7: 'event',
  13: 'chance',
  17: 'jail',
  19: 'event',
  23: 'chance',
  29: 'event',
  34: 'freeParking',
  40: 'vacation',
  42: 'event',
  47: 'chance',
  53: 'event',
  57: 'goToJail',
  59: 'chance',
  62: 'event',
  65: 'tax:luxury',
  70: 'chance',
  75: 'event',
};

function buildBoard(): SpaceData[] {
  const board: SpaceData[] = [];
  for (let index = 0; index < BOARD_SIZE; index++) {
    const city = CITIES.find((c) => c.space === index);
    const airport = AIRPORTS.find((a) => a.space === index);
    const company = COMPANIES.find((c) => c.space === index);
    const special = SPECIALS[index];
    const found = [city, airport, company, special].filter((x) => x !== undefined).length;
    if (found !== 1) throw new Error(`Board space ${index} is defined ${found} times`);
    if (city) board.push({ index, type: 'city', city });
    else if (airport) board.push({ index, type: 'airport', airport });
    else if (company) board.push({ index, type: 'company', company });
    else if (special === 'tax:income') board.push({ index, type: 'tax', tax: 'income' });
    else if (special === 'tax:luxury') board.push({ index, type: 'tax', tax: 'luxury' });
    else board.push({ index, type: special as Exclude<SpecialType, 'tax'> });
  }
  return board;
}

export const BOARD: readonly SpaceData[] = buildBoard();

export const CITY_BY_SPACE: ReadonlyMap<number, CityData> = new Map(CITIES.map((c) => [c.space, c]));
export const AIRPORT_BY_SPACE: ReadonlyMap<number, AirportData> = new Map(AIRPORTS.map((a) => [a.space, a]));
export const COMPANY_BY_SPACE: ReadonlyMap<number, CompanyData> = new Map(COMPANIES.map((c) => [c.space, c]));

/** All property spaces (cities, airports, companies) in board order. */
export const PROPERTY_SPACES: readonly number[] = BOARD.filter(
  (s) => s.type === 'city' || s.type === 'airport' || s.type === 'company',
).map((s) => s.index);

export const AIRPORT_SPACES: readonly number[] = AIRPORTS.map((a) => a.space);
export const COMPANY_SPACES: readonly number[] = COMPANIES.map((c) => c.space);

/** City spaces of each country, in board order. */
export const COUNTRY_CITIES: Readonly<Record<CountryId, readonly number[]>> = Object.fromEntries(
  COUNTRIES.map((country) => [
    country.id,
    CITIES.filter((c) => c.country === country.id)
      .map((c) => c.space)
      .sort((a, b) => a - b),
  ]),
) as unknown as Record<CountryId, readonly number[]>;

export function isProperty(index: number): boolean {
  const t = BOARD[index]?.type;
  return t === 'city' || t === 'airport' || t === 'company';
}

export function propertyKind(index: number): PropertyKind | null {
  const t = BOARD[index]?.type;
  return t === 'city' || t === 'airport' || t === 'company' ? t : null;
}

export function propertyPrice(index: number): number {
  return (
    CITY_BY_SPACE.get(index)?.price ??
    AIRPORT_BY_SPACE.get(index)?.price ??
    COMPANY_BY_SPACE.get(index)?.price ??
    0
  );
}

/** Display name of a property space (special spaces are named in ui/strings.ts). */
export function propertyName(index: number): string {
  return (
    CITY_BY_SPACE.get(index)?.name ??
    AIRPORT_BY_SPACE.get(index)?.name ??
    COMPANY_BY_SPACE.get(index)?.name ??
    ''
  );
}

export type BoardSide = 'top' | 'right' | 'bottom' | 'left';

export interface GridPosition {
  /** 0-based column on the 18-column grid. */
  col: number;
  /** 0-based row on the 24-row grid. */
  row: number;
  side: BoardSide;
  corner: boolean;
}

export const GRID_COLUMNS = 18;
export const GRID_ROWS = 24;
export const CORNERS: readonly number[] = [0, 17, 40, 57];

/** Index-to-grid mapping from spec section 3 (Geometry). */
export function gridPosition(index: number): GridPosition {
  const corner = CORNERS.includes(index);
  if (index >= 0 && index <= 17) return { col: index, row: 0, side: 'top', corner };
  if (index >= 18 && index <= 40) return { col: 17, row: index - 17, side: 'right', corner };
  if (index >= 41 && index <= 57) return { col: 57 - index, row: 23, side: 'bottom', corner };
  if (index >= 58 && index <= 79) return { col: 0, row: 80 - index, side: 'left', corner };
  throw new Error(`No board space ${index}`);
}
