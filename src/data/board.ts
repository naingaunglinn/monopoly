// The boards (spec section 3). The full World board has 80 spaces, indexed clockwise from World
// Start: 42 cities, 10 airports, 8 companies and 20 special spaces. BOARD_SIZE and BOARD_SHAPE
// (balance.ts) choose the World board in play: a smaller board leaves out spaces of the full board
// in the order of LEAVE_OUT, keeps the others in their order (prices still rise around the board),
// and puts the four corners at the ends of its sides (D96). The Myanmar map is its own 48-space
// board (data/myanmar.ts, D101).
//
// The board in play: the exports below the maps (BOARD, CITIES, SPACES, CITY_BY_SPACE...) are live
// bindings to the map of the game being played. Every engine entry point calls useMap(state) first
// (the server plays rooms of both maps in one process), and the screens do when a game is shown.
import { ALL_AIRPORTS, type AirportData } from './airports.js';
import { BOARD_SHAPE, BOARD_SIZE, MYANMAR_RULES, WORLD_RULES, type BoardShape, type MapRules } from './balance.js';
import type { CardData } from './cardTypes.js';
import { ALL_CITIES, type CityData } from './cities.js';
import { ALL_COMPANIES, type CompanyData, type CompanyId } from './companies.js';
import { ALL_COUNTRIES, COUNTRY_BY_ID, type CountryData, type CountryId } from './countries.js';
import { pick } from './lang.js';
import {
  MYANMAR_CITIES,
  MYANMAR_COMPANIES,
  MYANMAR_GROUPS,
  MYANMAR_SIZE,
  MYANMAR_SPECIALS,
  MYANMAR_TEMPLES,
  MYANMAR_TRANSPORT,
  type TempleData,
} from './myanmar.js';

export type SpecialType =
  | 'start'
  | 'chance'
  | 'event'
  | 'tax'
  | 'jail'
  | 'goToJail'
  | 'vacation'
  | 'freeParking'
  /** Myanmar map: a pagoda (D101). */
  | 'temple';

export type SpaceType = 'city' | 'airport' | 'company' | SpecialType;
export type TaxKind = 'income' | 'luxury';
export type PropertyKind = 'city' | 'airport' | 'company';

export type SpaceData =
  | { index: number; type: 'city'; city: CityData }
  | { index: number; type: 'airport'; airport: AirportData }
  | { index: number; type: 'company'; company: CompanyData }
  | { index: number; type: 'tax'; tax: TaxKind }
  | { index: number; type: 'temple'; temple: TempleData }
  | { index: number; type: Exclude<SpecialType, 'tax' | 'temple'> };

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
  return { index, type: special as Exclude<SpecialType, 'tax' | 'temple'> };
}

/** A company sits between the countries of the nearest cities before and after it. */
function setBetween(spaces: SpaceData[]): void {
  const size = spaces.length;
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
  setBetween(spaces);

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

/** The Myanmar map's board: its own 48 spaces, square, eleven between corners (D101). */
export function buildMyanmarBoard(): BoardLayout {
  const spaces: SpaceData[] = [];
  for (let index = 0; index < MYANMAR_SIZE; index++) {
    const city = MYANMAR_CITIES.find((c) => c.space === index);
    const airport = MYANMAR_TRANSPORT.find((a) => a.space === index);
    const company = MYANMAR_COMPANIES.find((c) => c.space === index);
    const special = MYANMAR_SPECIALS[index];
    const found = [city, airport, company, special].filter((x) => x !== undefined).length;
    if (found !== 1) throw new Error(`Myanmar space ${index} is defined ${found} times`);
    if (city) spaces.push({ index, type: 'city', city });
    else if (airport) spaces.push({ index, type: 'airport', airport });
    else if (company) spaces.push({ index, type: 'company', company: { ...company } });
    else if (special === 'tax:income') spaces.push({ index, type: 'tax', tax: 'income' });
    else if (special === 'tax:luxury') spaces.push({ index, type: 'tax', tax: 'luxury' });
    else if (special === 'temple') spaces.push({ index, type: 'temple', temple: MYANMAR_TEMPLES[index] as TempleData });
    else spaces.push({ index, type: special as Exclude<SpecialType, 'tax' | 'temple'> });
  }
  setBetween(spaces);
  const across = 11;
  const down = 11;
  const cities = spaces.flatMap((s) => (s.type === 'city' ? [s.city] : []));
  return {
    size: MYANMAR_SIZE,
    shape: 'square',
    across,
    down,
    spaces,
    corners: [0, across + 1, across + down + 2, 2 * across + down + 3],
    cities,
    airports: spaces.flatMap((s) => (s.type === 'airport' ? [s.airport] : [])),
    companies: spaces.flatMap((s) => (s.type === 'company' ? [s.company] : [])),
    countries: MYANMAR_GROUPS.filter((c) => cities.some((city) => city.country === c.id)),
    fullIndex: spaces.map((s) => s.index),
  };
}

export type MapId = 'world' | 'myanmar';
export const MAP_IDS: readonly MapId[] = ['world', 'myanmar'];

/** A map: its board and everything looked up on it, worked out once. */
export interface GameMap {
  id: MapId;
  rules: MapRules;
  layout: BoardLayout;
  spaces: { start: number; jail: number; vacation: number; goToJail: number };
  cityBySpace: ReadonlyMap<number, CityData>;
  airportBySpace: ReadonlyMap<number, AirportData>;
  companyBySpace: ReadonlyMap<number, CompanyData>;
  propertySpaces: readonly number[];
  airportSpaces: readonly number[];
  companySpaces: readonly number[];
  countryCities: Readonly<Record<CountryId, readonly number[]>>;
}

function gameMap(id: MapId, rules: MapRules, layout: BoardLayout): GameMap {
  const groups = [...ALL_COUNTRIES, ...MYANMAR_GROUPS];
  return {
    id,
    rules,
    layout,
    spaces: { start: layout.corners[0], jail: layout.corners[1], vacation: layout.corners[2], goToJail: layout.corners[3] },
    cityBySpace: new Map(layout.cities.map((c) => [c.space, c])),
    airportBySpace: new Map(layout.airports.map((a) => [a.space, a])),
    companyBySpace: new Map(layout.companies.map((c) => [c.space, c])),
    propertySpaces: layout.spaces.filter((s) => s.type === 'city' || s.type === 'airport' || s.type === 'company').map((s) => s.index),
    airportSpaces: layout.airports.map((a) => a.space),
    companySpaces: layout.companies.map((c) => c.space),
    countryCities: Object.fromEntries(
      groups.map((country) => [country.id, layout.cities.filter((c) => c.country === country.id).map((c) => c.space)]),
    ) as unknown as Record<CountryId, readonly number[]>,
  };
}

/** Both maps, built once when the module loads. */
export const MAPS: Readonly<Record<MapId, GameMap>> = {
  world: gameMap('world', WORLD_RULES, buildBoard(BOARD_SIZE, BOARD_SHAPE)),
  myanmar: gameMap('myanmar', MYANMAR_RULES, buildMyanmarBoard()),
};

/** The map in play (see the note at the top). */
export let MAP: GameMap = MAPS.world;
export let RULES: MapRules = MAP.rules;
export let LAYOUT: BoardLayout = MAP.layout;
export let BOARD: readonly SpaceData[] = LAYOUT.spaces;
/** The cities, airports, companies and countries on the board in play, in board order. */
export let CITIES: readonly CityData[] = LAYOUT.cities;
export let AIRPORTS: readonly AirportData[] = LAYOUT.airports;
export let COMPANIES: readonly CompanyData[] = LAYOUT.companies;
export let COUNTRIES: readonly CountryData[] = LAYOUT.countries;
export let SPACES: GameMap['spaces'] = MAP.spaces;
export let CITY_BY_SPACE: ReadonlyMap<number, CityData> = MAP.cityBySpace;
export let AIRPORT_BY_SPACE: ReadonlyMap<number, AirportData> = MAP.airportBySpace;
export let COMPANY_BY_SPACE: ReadonlyMap<number, CompanyData> = MAP.companyBySpace;
/** All property spaces (cities, airports, companies) in board order. */
export let PROPERTY_SPACES: readonly number[] = MAP.propertySpaces;
export let AIRPORT_SPACES: readonly number[] = MAP.airportSpaces;
export let COMPANY_SPACES: readonly number[] = MAP.companySpaces;
/** City spaces of each country, in board order (empty for a country that is not on the board). */
export let COUNTRY_CITIES: Readonly<Record<CountryId, readonly number[]>> = MAP.countryCities;
/** The board's grid: the spaces along a side plus the two corners. */
export let GRID_COLUMNS = LAYOUT.across + 2;
export let GRID_ROWS = LAYOUT.down + 2;
export let CORNERS: readonly number[] = LAYOUT.corners;

/** Makes `id` the map in play. Cheap when it already is. */
export function setActiveMap(id: MapId): void {
  const next = MAPS[id] ?? MAPS.world;
  if (next === MAP) return;
  MAP = next;
  RULES = next.rules;
  LAYOUT = next.layout;
  BOARD = LAYOUT.spaces;
  CITIES = LAYOUT.cities;
  AIRPORTS = LAYOUT.airports;
  COMPANIES = LAYOUT.companies;
  COUNTRIES = LAYOUT.countries;
  SPACES = next.spaces;
  CITY_BY_SPACE = next.cityBySpace;
  AIRPORT_BY_SPACE = next.airportBySpace;
  COMPANY_BY_SPACE = next.companyBySpace;
  PROPERTY_SPACES = next.propertySpaces;
  AIRPORT_SPACES = next.airportSpaces;
  COMPANY_SPACES = next.companySpaces;
  COUNTRY_CITIES = next.countryCities;
  GRID_COLUMNS = LAYOUT.across + 2;
  GRID_ROWS = LAYOUT.down + 2;
  CORNERS = LAYOUT.corners;
}

/** Makes the map of this game (or these settings) the map in play. */
export function useMap(of: { meta: { settings: { map?: MapId } } } | { map?: MapId } | null | undefined): void {
  if (!of) return;
  const id = 'meta' in of ? of.meta.settings.map : of.map;
  setActiveMap(id === 'myanmar' ? 'myanmar' : 'world');
}

/** The pagoda on this space of the board in play, or null. */
export function templeAt(index: number): TempleData | null {
  const s = BOARD[index];
  return s?.type === 'temple' ? s.temple : null;
}

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

type Named = { name: string; nameMy?: string; shortName?: string; shortNameMy?: string };

/** Display name of a property space, in the device's language (special spaces are named in ui/strings.ts). */
export function propertyName(index: number): string {
  const found = (CITY_BY_SPACE.get(index) ?? AIRPORT_BY_SPACE.get(index) ?? COMPANY_BY_SPACE.get(index)) as Named | undefined;
  return found ? pick(found.name, found.nameMy) : '';
}

/** Short name of an airport or company (compact tiles), in the device's language. */
export function propertyShortName(index: number): string {
  const found = (AIRPORT_BY_SPACE.get(index) ?? COMPANY_BY_SPACE.get(index)) as Named | undefined;
  if (!found) return propertyName(index);
  return pick(found.shortName ?? found.name, found.shortNameMy ?? found.nameMy);
}

/** A colour group's name (country or region), in the device's language. */
export function groupName(id: CountryId): string {
  const g = COUNTRY_BY_ID[id];
  return g ? pick(g.name, g.nameMy) : '';
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
