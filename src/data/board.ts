// The board (spec section 3). The full board has 80 spaces, indexed clockwise from World Start:
// 42 cities, 10 airports, 8 companies and 20 special spaces. BOARD_SIZE and BOARD_SHAPE
// (balance.ts) choose the board in play: a smaller board leaves out spaces of the full board in the
// order of LEAVE_OUT, keeps the others in their order (prices still rise around the board), and
// puts the four corners at the ends of its sides (D96).
import { ALL_AIRPORTS, type AirportData } from './airports.js';
import { BOARD_SHAPE, BOARD_SIZE, type BoardShape } from './balance.js';
import type { CardData } from './cardTypes.js';
import { ALL_CITIES, type CityData } from './cities.js';
import { ALL_COMPANIES, type CompanyData, type CompanyId } from './companies.js';
import { ALL_COUNTRIES, type CountryData, type CountryId } from './countries.js';

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

/** Spaces on the full board, the largest board the data holds. */
export const FULL_BOARD_SIZE = 80;
/** The smallest board: a smaller one would take too many cards out of the Event deck. */
export const MIN_BOARD_SIZE = 40;

/** The special spaces of the full board. */
const FULL_SPECIALS: Readonly<Record<number, SpecialType | `tax:${TaxKind}`>> = {
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

/** The corners of the full board: World Start, Jail, Vacation and Go To Jail. */
const FULL_CORNERS = [0, 17, 40, 57] as const;

type LeaveOut =
  | { country: CountryId; company?: CompanyId }
  | { airport: CountryId }
  | { special: number };

/**
 * What a smaller board leaves out of the full board, first to last. A board of N spaces walks the
 * list and leaves out each entry that still fits in the 80 − N spaces it has to lose, so a country
 * always stays or goes whole. Never listed: the corners, the taxes and the four countries Chance
 * cards send players to (Brazil, Japan, Myanmar, United States). A company goes together with a
 * neighbouring country, and the Event cards about it leave the deck (cardFits).
 */
const LEAVE_OUT: readonly LeaveOut[] = [
  { special: 34 }, // Free Parking
  { country: 'netherlands' },
  { special: 62 }, // Event
  { country: 'canada' },
  { airport: 'mexico' },
  { special: 59 }, // Chance
  { country: 'spain' },
  { special: 42 }, // Event
  { country: 'southKorea' },
  { airport: 'china' },
  { special: 13 }, // Chance
  { special: 19 }, // Event
  { country: 'france' },
  { airport: 'germany' }, // 60 spaces
  { country: 'germany', company: 'trading' },
  { special: 75 }, // Event
  { airport: 'italy' },
  { country: 'unitedKingdom' },
  { airport: 'unitedKingdom' },
  { special: 70 }, // Chance
  { country: 'israel' },
  { airport: 'japan' },
  { special: 29 }, // Event
  { country: 'italy', company: 'shipping' }, // 40 spaces
  { airport: 'egypt' },
  { special: 23 }, // Chance
];

function leftOutSpaces(entry: LeaveOut): number[] {
  if ('special' in entry) return [entry.special];
  if ('airport' in entry) return ALL_AIRPORTS.filter((a) => a.country === entry.airport).map((a) => a.space);
  const cities = ALL_CITIES.filter((c) => c.country === entry.country).map((c) => c.space);
  const company = entry.company ? ALL_COMPANIES.filter((c) => c.id === entry.company).map((c) => c.space) : [];
  return [...cities, ...company];
}

/** Spaces between two corners: along the top and bottom (`across`) and the left and right (`down`). */
export interface BoardSides {
  across: number;
  down: number;
}

export function boardSides(size: number, shape: BoardShape): BoardSides {
  const half = (size - 4) / 2;
  if (shape === 'square') return { across: half / 2, down: half / 2 };
  // The full board's 16 across and 22 down.
  const across = Math.round((half * 16) / 38);
  return { across, down: half - across };
}

/** Why this size and shape make no board (a sentence that says how to fix it), or null. */
export function boardProblem(size: number, shape: BoardShape): string | null {
  if (shape !== 'square' && shape !== 'rectangle') return `BOARD_SHAPE must be 'square' or 'rectangle', not '${String(shape)}'.`;
  if (!Number.isInteger(size) || size < MIN_BOARD_SIZE || size > FULL_BOARD_SIZE) {
    return `BOARD_SIZE must be a whole number from ${MIN_BOARD_SIZE} to ${FULL_BOARD_SIZE}, not ${size}. A board above ${FULL_BOARD_SIZE} needs more cities in src/data/cities.ts first.`;
  }
  if (shape === 'square' && size % 4 !== 0) {
    return `A square board needs a BOARD_SIZE that divides by 4 (such as ${size - (size % 4)} or ${size - (size % 4) + 4}), not ${size}.`;
  }
  if (shape === 'rectangle' && size % 2 !== 0) return `A rectangular board needs an even BOARD_SIZE, not ${size}.`;
  return null;
}

/** Every board size and shape that makes a board, smallest first. */
export function validBoards(): { size: number; shape: BoardShape }[] {
  const out: { size: number; shape: BoardShape }[] = [];
  for (let size = MIN_BOARD_SIZE; size <= FULL_BOARD_SIZE; size++) {
    for (const shape of ['square', 'rectangle'] as const) if (boardProblem(size, shape) === null) out.push({ size, shape });
  }
  return out;
}

export interface BoardLayout {
  size: number;
  shape: BoardShape;
  across: number;
  down: number;
  spaces: readonly SpaceData[];
  /** World Start, Jail, Vacation and Go To Jail, clockwise. */
  corners: readonly [number, number, number, number];
  cities: readonly CityData[];
  airports: readonly AirportData[];
  companies: readonly CompanyData[];
  /** The countries with cities on this board, in board order. */
  countries: readonly CountryData[];
  /** The full-board index of each space. */
  fullIndex: readonly number[];
}

/** The full board with every space defined exactly once. */
function fullSpaceAt(index: number): SpaceData {
  const city = ALL_CITIES.find((c) => c.space === index);
  const airport = ALL_AIRPORTS.find((a) => a.space === index);
  const company = ALL_COMPANIES.find((c) => c.space === index);
  const special = FULL_SPECIALS[index];
  const found = [city, airport, company, special].filter((x) => x !== undefined).length;
  if (found !== 1) throw new Error(`Board space ${index} is defined ${found} times`);
  if (city) return { index, type: 'city', city };
  if (airport) return { index, type: 'airport', airport };
  if (company) return { index, type: 'company', company };
  if (special === 'tax:income') return { index, type: 'tax', tax: 'income' };
  if (special === 'tax:luxury') return { index, type: 'tax', tax: 'luxury' };
  return { index, type: special as Exclude<SpecialType, 'tax'> };
}

/** Builds the board of `size` spaces and `shape` from the full board. Throws on a size it cannot make. */
export function buildBoard(size: number, shape: BoardShape): BoardLayout {
  const problem = boardProblem(size, shape);
  if (problem !== null) throw new Error(problem);
  const full = Array.from({ length: FULL_BOARD_SIZE }, (_, i) => fullSpaceAt(i));

  const out = new Set<number>();
  let toLose = FULL_BOARD_SIZE - size;
  for (const entry of LEAVE_OUT) {
    const group = leftOutSpaces(entry);
    if (group.length === 0 || group.length > toLose) continue;
    for (const space of group) out.add(space);
    toLose -= group.length;
  }
  if (toLose > 0) throw new Error(`LEAVE_OUT cannot make a board of ${size} spaces`);

  const kept = full.map((s) => s.index).filter((i) => !(FULL_CORNERS as readonly number[]).includes(i) && !out.has(i));
  const { across, down } = boardSides(size, shape);
  const fullIndex: number[] = [];
  let next = 0;
  [across, down, across, down].forEach((run, side) => {
    fullIndex.push(FULL_CORNERS[side] as number);
    for (let i = 0; i < run; i++) fullIndex.push(kept[next++] as number);
  });

  const spaces: SpaceData[] = fullIndex.map((from, index) => {
    const s = full[from] as SpaceData;
    if (s.type === 'city') return { index, type: 'city', city: { ...s.city, space: index } };
    if (s.type === 'airport') return { index, type: 'airport', airport: { ...s.airport, space: index } };
    if (s.type === 'company') return { index, type: 'company', company: { ...s.company, space: index } };
    return { ...s, index };
  });
  // A company sits between the countries of the nearest cities before and after it.
  const cityAt = (i: number) => {
    const s = spaces[((i % size) + size) % size] as SpaceData;
    return s.type === 'city' ? s.city.country : null;
  };
  const nearest = (from: number, step: 1 | -1): CountryId => {
    for (let k = 1; k < size; k++) {
      const country = cityAt(from + k * step);
      if (country) return country;
    }
    throw new Error('A board without cities');
  };
  for (const s of spaces) {
    if (s.type === 'company') s.company = { ...s.company, between: [nearest(s.index, -1), nearest(s.index, 1)] };
  }

  const cities = spaces.flatMap((s) => (s.type === 'city' ? [s.city] : []));
  const corners = [0, across + 1, across + down + 2, 2 * across + down + 3] as const;
  return {
    size,
    shape,
    across,
    down,
    spaces,
    corners,
    cities,
    airports: spaces.flatMap((s) => (s.type === 'airport' ? [s.airport] : [])),
    companies: spaces.flatMap((s) => (s.type === 'company' ? [s.company] : [])),
    countries: ALL_COUNTRIES.filter((c) => cities.some((city) => city.country === c.id)),
    fullIndex,
  };
}

/** A card fits a board when every company and country it names is on it. */
export function cardFits(card: CardData, layout: BoardLayout): boolean {
  const e = card.effect;
  if (e.type === 'companyOwnerCash') return layout.companies.some((c) => c.id === e.company);
  if (e.type === 'moveTo' && e.target.kind === 'country') {
    const country = e.target.country;
    return layout.countries.some((c) => c.id === country);
  }
  if (e.type === 'moveTo' && e.target.kind === 'space') return e.target.index < layout.size;
  return true;
}

/** The board in play. */
export const LAYOUT: BoardLayout = buildBoard(BOARD_SIZE, BOARD_SHAPE);

export const BOARD: readonly SpaceData[] = LAYOUT.spaces;
/** The cities, airports, companies and countries on the board in play, in board order. */
export const CITIES: readonly CityData[] = LAYOUT.cities;
export const AIRPORTS: readonly AirportData[] = LAYOUT.airports;
export const COMPANIES: readonly CompanyData[] = LAYOUT.companies;
export const COUNTRIES: readonly CountryData[] = LAYOUT.countries;

export const SPACES = {
  start: LAYOUT.corners[0],
  jail: LAYOUT.corners[1],
  vacation: LAYOUT.corners[2],
  goToJail: LAYOUT.corners[3],
} as const;

export const CITY_BY_SPACE: ReadonlyMap<number, CityData> = new Map(CITIES.map((c) => [c.space, c]));
export const AIRPORT_BY_SPACE: ReadonlyMap<number, AirportData> = new Map(AIRPORTS.map((a) => [a.space, a]));
export const COMPANY_BY_SPACE: ReadonlyMap<number, CompanyData> = new Map(COMPANIES.map((c) => [c.space, c]));

/** All property spaces (cities, airports, companies) in board order. */
export const PROPERTY_SPACES: readonly number[] = BOARD.filter(
  (s) => s.type === 'city' || s.type === 'airport' || s.type === 'company',
).map((s) => s.index);

export const AIRPORT_SPACES: readonly number[] = AIRPORTS.map((a) => a.space);
export const COMPANY_SPACES: readonly number[] = COMPANIES.map((c) => c.space);

/** City spaces of each country, in board order (empty for a country that is not on the board). */
export const COUNTRY_CITIES: Readonly<Record<CountryId, readonly number[]>> = Object.fromEntries(
  ALL_COUNTRIES.map((country) => [country.id, CITIES.filter((c) => c.country === country.id).map((c) => c.space)]),
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
  /** 0-based column on the grid of GRID_COLUMNS. */
  col: number;
  /** 0-based row on the grid of GRID_ROWS. */
  row: number;
  side: BoardSide;
  corner: boolean;
}

/** The board's grid: the spaces along a side plus the two corners. */
export const GRID_COLUMNS = LAYOUT.across + 2;
export const GRID_ROWS = LAYOUT.down + 2;
export const CORNERS: readonly number[] = LAYOUT.corners;

/** Index-to-grid mapping (spec section 3, Geometry): World Start top left, then clockwise. */
export function gridPositionOn(layout: BoardLayout, index: number): GridPosition {
  const { across: a, down: d, size } = layout;
  const corner = layout.corners.includes(index);
  if (index >= 0 && index <= a + 1) return { col: index, row: 0, side: 'top', corner };
  if (index > a + 1 && index <= a + d + 2) return { col: a + 1, row: index - (a + 1), side: 'right', corner };
  if (index > a + d + 2 && index <= 2 * a + d + 3) return { col: 2 * a + d + 3 - index, row: d + 1, side: 'bottom', corner };
  if (index > 2 * a + d + 3 && index < size) return { col: 0, row: size - index, side: 'left', corner };
  throw new Error(`No board space ${index}`);
}

export function gridPosition(index: number): GridPosition {
  return gridPositionOn(LAYOUT, index);
}
