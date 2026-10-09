// Board and property data (spec sections 3 and 4). The tables below are an independent copy of
// the spec so that a typo in src/data fails here. The full board is built by the same builder as
// the board in play; every size and shape it accepts is checked (D96).
import { describe, expect, test } from 'vitest';
import { ALL_AIRPORTS } from '../../src/data/airports';
import { BALANCE, BOARD_SHAPE, BOARD_SIZE, mortgageValue, unmortgageCost } from '../../src/data/balance';
import {
  BOARD,
  boardProblem,
  buildBoard,
  cardFits,
  CORNERS,
  COUNTRY_CITIES,
  gridPosition,
  gridPositionOn,
  LAYOUT,
  PROPERTY_SPACES,
  propertyName,
  SPACES,
  validBoards,
  type BoardLayout,
  type SpaceData,
} from '../../src/data/board';
import { CHANCE_CARDS } from '../../src/data/chance';
import { ALL_CITIES } from '../../src/data/cities';
import { ALL_COMPANIES } from '../../src/data/companies';
import { ALL_COUNTRIES } from '../../src/data/countries';
import { EVENT_CARDS } from '../../src/data/events';
import { cardsForSettings, DEFAULT_SETTINGS } from '../../src/engine';

const SPEC_CITIES: Array<[string, string, number, number, number, number]> = [
  ['Brazil', 'Brasília', 1, 70, 7, 40],
  ['Brazil', 'Rio de Janeiro', 3, 90, 9, 40],
  ['Mexico', 'Mexico City', 6, 110, 11, 45],
  ['Mexico', 'Guadalajara', 8, 130, 13, 45],
  ['Mexico', 'Monterrey', 10, 150, 15, 45],
  ['Egypt', 'Cairo', 12, 170, 17, 50],
  ['Egypt', 'Alexandria', 14, 190, 19, 50],
  ['Israel', 'Jerusalem', 18, 210, 21, 55],
  ['Israel', 'Tel Aviv', 20, 230, 23, 55],
  ['Israel', 'Haifa', 21, 250, 25, 55],
  ['Spain', 'Madrid', 22, 270, 27, 60],
  ['Spain', 'Barcelona', 24, 290, 29, 60],
  ['Italy', 'Rome', 26, 310, 31, 65],
  ['Italy', 'Milan', 28, 330, 33, 65],
  ['Italy', 'Venice', 30, 350, 35, 65],
  ['Germany', 'Berlin', 32, 370, 37, 70],
  ['Germany', 'Munich', 33, 390, 39, 70],
  ['Germany', 'Frankfurt', 36, 410, 41, 70],
  ['Japan', 'Tokyo', 38, 430, 43, 75],
  ['Japan', 'Osaka', 41, 450, 45, 75],
  ['South Korea', 'Seoul', 43, 470, 47, 80],
  ['South Korea', 'Busan', 44, 490, 49, 80],
  ['China', 'Beijing', 46, 510, 51, 85],
  ['China', 'Shanghai', 49, 530, 53, 85],
  ['China', 'Shenzhen', 50, 550, 55, 85],
  ['Myanmar', 'Yangon', 52, 570, 57, 90],
  ['Myanmar', 'Mandalay', 54, 590, 59, 90],
  ['Myanmar', 'Naypyitaw', 56, 610, 61, 90],
  ['France', 'Paris', 58, 630, 63, 95],
  ['France', 'Lyon', 60, 650, 65, 95],
  ['France', 'Marseille', 61, 670, 67, 95],
  ['Netherlands', 'Amsterdam', 63, 680, 68, 100],
  ['Netherlands', 'Rotterdam', 64, 690, 69, 100],
  ['United Kingdom', 'London', 66, 700, 70, 105],
  ['United Kingdom', 'Manchester', 68, 710, 71, 105],
  ['United Kingdom', 'Birmingham', 69, 720, 72, 105],
  ['Canada', 'Toronto', 71, 730, 73, 110],
  ['Canada', 'Vancouver', 72, 740, 74, 110],
  ['United States', 'New York', 74, 750, 75, 115],
  ['United States', 'Los Angeles', 76, 760, 76, 115],
  ['United States', 'Chicago', 78, 770, 77, 115],
  ['United States', 'San Francisco', 79, 780, 78, 115],
];

const SPEC_AIRPORTS: Array<[string, number, number]> = [
  ['Brazil Airport', 4, 100],
  ['Mexico Airport', 9, 110],
  ['Egypt Airport', 15, 120],
  ['Italy Airport', 27, 130],
  ['Germany Airport', 35, 140],
  ['Japan Airport', 39, 150],
  ['China Airport', 48, 160],
  ['Myanmar Airport', 55, 170],
  ['United Kingdom Airport', 67, 180],
  ['United States Airport', 77, 200],
];

const SPEC_COMPANIES: Array<[string, number, string, string, number, number]> = [
  ['Transportation Company', 11, 'Mexico', 'Egypt', 200, 25],
  ['Oil Company', 16, 'Egypt', 'Israel', 180, 25],
  ['International Shipping Company', 25, 'Spain', 'Italy', 280, 35],
  ['Electricity / Power Grid', 31, 'Italy', 'Germany', 220, 30],
  ['Global Trading Company', 37, 'Germany', 'Japan', 320, 40],
  ['Telecommunications Company', 45, 'South Korea', 'China', 360, 45],
  ['Rice Trading Company', 51, 'China', 'Myanmar', 260, 35],
  ['Global Finance Company', 73, 'Canada', 'United States', 400, 50],
];

const SPEC_SPECIALS: Array<[number, string]> = [
  [0, 'start'],
  [2, 'chance'],
  [5, 'tax'],
  [7, 'event'],
  [13, 'chance'],
  [17, 'jail'],
  [19, 'event'],
  [23, 'chance'],
  [29, 'event'],
  [34, 'freeParking'],
  [40, 'vacation'],
  [42, 'event'],
  [47, 'chance'],
  [53, 'event'],
  [57, 'goToJail'],
  [59, 'chance'],
  [62, 'event'],
  [65, 'tax'],
  [70, 'chance'],
  [75, 'event'],
];

const countryName = (id: string) => ALL_COUNTRIES.find((c) => c.id === id)?.name;

const FULL = buildBoard(80, 'rectangle');

/** A space as a short label: a property's name, else its type ('tax:income' for a tax). */
function label(space: SpaceData): string {
  if (space.type === 'city') return space.city.name;
  if (space.type === 'airport') return space.airport.name;
  if (space.type === 'company') return space.company.name;
  if (space.type === 'tax') return `tax:${space.tax}`;
  return space.type;
}

describe('the full board', () => {
  test('has exactly 80 spaces with the specified counts', () => {
    expect(FULL.spaces).toHaveLength(80);
    FULL.spaces.forEach((space, i) => expect(space.index).toBe(i));
    expect(FULL.fullIndex).toEqual(Array.from({ length: 80 }, (_, i) => i));
    const count = (type: string) => FULL.spaces.filter((s) => s.type === type).length;
    expect(count('city')).toBe(42);
    expect(count('airport')).toBe(10);
    expect(count('company')).toBe(8);
    expect(80 - 42 - 10 - 8).toBe(20);
    expect(count('chance')).toBe(6);
    expect(count('event')).toBe(7);
    expect(count('tax')).toBe(2);
    for (const type of ['start', 'jail', 'goToJail', 'vacation', 'freeParking']) expect(count(type)).toBe(1);
  });

  test('special spaces sit at their fixed indices', () => {
    for (const [index, type] of SPEC_SPECIALS) expect(FULL.spaces[index]?.type).toBe(type);
    expect(label(FULL.spaces[5] as SpaceData)).toBe('tax:income');
    expect(label(FULL.spaces[65] as SpaceData)).toBe('tax:luxury');
    expect(FULL.corners).toEqual([0, 17, 40, 57]);
    expect([FULL.across, FULL.down]).toEqual([16, 22]);
  });

  test('countries appear in the specified clockwise order', () => {
    const order: string[] = [];
    for (const space of FULL.spaces) {
      if (space.type !== 'city') continue;
      const name = countryName(space.city.country) as string;
      if (order[order.length - 1] !== name) order.push(name);
    }
    expect(order).toEqual([
      'Brazil',
      'Mexico',
      'Egypt',
      'Israel',
      'Spain',
      'Italy',
      'Germany',
      'Japan',
      'South Korea',
      'China',
      'Myanmar',
      'France',
      'Netherlands',
      'United Kingdom',
      'Canada',
      'United States',
    ]);
    expect(ALL_COUNTRIES.map((c) => c.name)).toEqual(order);
    expect(FULL.countries.map((c) => c.name)).toEqual(order);
  });

  test('index-to-grid mapping follows the geometry table', () => {
    const at = (i: number) => gridPositionOn(FULL, i);
    expect(at(0)).toMatchObject({ col: 0, row: 0, corner: true });
    expect(at(9)).toMatchObject({ col: 9, row: 0 });
    expect(at(17)).toMatchObject({ col: 17, row: 0, corner: true });
    expect(at(18)).toMatchObject({ col: 17, row: 1 });
    expect(at(40)).toMatchObject({ col: 17, row: 23, corner: true });
    expect(at(41)).toMatchObject({ col: 16, row: 23 });
    expect(at(57)).toMatchObject({ col: 0, row: 23, corner: true });
    expect(at(58)).toMatchObject({ col: 0, row: 22 });
    expect(at(79)).toMatchObject({ col: 0, row: 1 });
    expect(() => at(80)).toThrow();
  });

  test('the cities, airports and companies match the spec exactly', () => {
    expect(ALL_CITIES).toHaveLength(42);
    expect(ALL_CITIES.map((c) => [countryName(c.country), c.name, c.space, c.price, c.baseRent, c.houseCost])).toEqual(SPEC_CITIES);
    expect(FULL.cities).toEqual(ALL_CITIES);
    expect(ALL_AIRPORTS.map((a) => [a.name, a.space, a.price])).toEqual(SPEC_AIRPORTS);
    expect(FULL.airports).toEqual(ALL_AIRPORTS);
    expect(BALANCE.airportRent).toEqual([40, 90, 160, 250, 350, 475, 625, 800, 1000, 1250]);
    const companies = (list: typeof ALL_COMPANIES) =>
      list.map((c) => [c.name, c.space, countryName(c.between[0]), countryName(c.between[1]), c.price, c.multiplier]);
    expect(companies(ALL_COMPANIES)).toEqual(SPEC_COMPANIES);
    // The builder works out the neighbours; on the full board they are the spec's.
    expect(companies(FULL.companies)).toEqual(SPEC_COMPANIES);
  });
});

// The 60-space square board (spec section 3), clockwise from World Start.
const SPEC_60_SQUARE = [
  'start', 'Brasília', 'chance', 'Rio de Janeiro', 'Brazil Airport', 'tax:income', 'Mexico City', 'event',
  'Guadalajara', 'Monterrey', 'Transportation Company', 'Cairo', 'Alexandria', 'Egypt Airport', 'Oil Company',
  'jail', 'Jerusalem', 'Tel Aviv', 'Haifa', 'chance', 'International Shipping Company', 'Rome', 'Italy Airport',
  'Milan', 'event', 'Venice', 'Electricity / Power Grid', 'Berlin', 'Munich', 'Frankfurt',
  'vacation', 'Global Trading Company', 'Tokyo', 'Japan Airport', 'Osaka', 'Telecommunications Company', 'Beijing',
  'chance', 'Shanghai', 'Shenzhen', 'Rice Trading Company', 'Yangon', 'event', 'Mandalay', 'Myanmar Airport',
  'goToJail', 'Naypyitaw', 'tax:luxury', 'London', 'United Kingdom Airport', 'Manchester', 'Birmingham', 'chance',
  'Global Finance Company', 'New York', 'event', 'Los Angeles', 'United States Airport', 'Chicago', 'San Francisco',
];

describe('the 60-space square board', () => {
  const b = buildBoard(60, 'square');

  test('holds these spaces in this order', () => {
    expect(b.spaces.map(label)).toEqual(SPEC_60_SQUARE);
    expect(b.corners).toEqual([0, 15, 30, 45]);
    expect([b.across, b.down]).toEqual([14, 14]);
    expect(b.countries.map((c) => c.name)).toEqual([
      'Brazil', 'Mexico', 'Egypt', 'Israel', 'Italy', 'Germany', 'Japan', 'China', 'Myanmar', 'United Kingdom', 'United States',
    ]);
    const count = (type: string) => b.spaces.filter((s) => s.type === type).length;
    expect([count('city'), count('airport'), count('company'), count('chance'), count('event'), count('tax')]).toEqual([31, 7, 8, 4, 4, 2]);
  });

  test('companies name their new neighbours', () => {
    expect(b.companies.map((c) => [c.name, c.between.map(countryName).join(' and ')])).toEqual([
      ['Transportation Company', 'Mexico and Egypt'],
      ['Oil Company', 'Egypt and Israel'],
      ['International Shipping Company', 'Israel and Italy'],
      ['Electricity / Power Grid', 'Italy and Germany'],
      ['Global Trading Company', 'Germany and Japan'],
      ['Telecommunications Company', 'Japan and China'],
      ['Rice Trading Company', 'China and Myanmar'],
      ['Global Finance Company', 'United Kingdom and United States'],
    ]);
  });
});

/** Checks that hold for every board the builder makes. */
function checkBoard(b: BoardLayout) {
  const where = `${b.size} ${b.shape}`;
  expect(b.spaces, where).toHaveLength(b.size);
  b.spaces.forEach((space, i) => expect(space.index).toBe(i));
  // Corners at the ends of the sides; a square has the same number of spaces on every side.
  expect(2 * b.across + 2 * b.down + 4).toBe(b.size);
  expect(b.corners).toEqual([0, b.across + 1, b.across + b.down + 2, 2 * b.across + b.down + 3]);
  expect(b.corners.map((i) => b.spaces[i]?.type)).toEqual(['start', 'jail', 'vacation', 'goToJail']);
  if (b.shape === 'square') expect(b.across).toBe(b.down);
  else expect(b.down).toBeGreaterThan(b.across);
  expect(b.spaces.filter((s) => ['start', 'jail', 'vacation', 'goToJail'].includes(s.type))).toHaveLength(4);
  // The other spaces keep the full board's order, so prices still rise around the board.
  const rest = b.fullIndex.filter((_, i) => !b.corners.includes(i));
  expect([...rest].sort((x, y) => x - y)).toEqual(rest);
  const rising = (prices: number[]) => prices.every((p, i) => i === 0 || p > (prices[i - 1] as number));
  expect(rising(b.cities.map((c) => c.price)), where).toBe(true);
  expect(rising(b.airports.map((a) => a.price)), where).toBe(true);
  // Every space is the full board's space, renumbered.
  b.spaces.forEach((space, i) => expect(label(space)).toBe(label(FULL.spaces[b.fullIndex[i] as number] as SpaceData)));
  // A country is on the board whole or not at all; the four the Chance cards visit always are.
  for (const country of ALL_COUNTRIES) {
    const here = b.cities.filter((c) => c.country === country.id).length;
    const all = ALL_CITIES.filter((c) => c.country === country.id).length;
    expect([0, all], `${where}: ${country.name}`).toContain(here);
  }
  for (const id of ['brazil', 'japan', 'myanmar', 'unitedStates']) expect(b.countries.map((c) => c.id), where).toContain(id);
  expect(b.spaces.filter((s) => s.type === 'tax')).toHaveLength(2);
  if (b.size >= 57) expect(b.companies, where).toHaveLength(8);
  expect(b.airports.length, where).toBeGreaterThanOrEqual(3);
  expect(b.spaces.filter((s) => s.type === 'chance').length, where).toBeGreaterThanOrEqual(2);
  expect(b.spaces.filter((s) => s.type === 'event').length, where).toBeGreaterThanOrEqual(2);
  // Each company sits between the countries of the nearest cities on either side.
  for (const company of b.companies) {
    const city = (step: number) => {
      for (let k = 1; ; k++) {
        const s = b.spaces[(company.space + k * step + b.size) % b.size] as SpaceData;
        if (s.type === 'city') return s.city.country;
      }
    };
    expect(company.between, `${where}: ${company.name}`).toEqual([city(-1), city(1)]);
  }
  // The grid is the ring of a (across + 2) by (down + 2) grid, every cell once.
  const cells = new Set<string>();
  for (let i = 0; i < b.size; i++) {
    const { col, row } = gridPositionOn(b, i);
    expect(col === 0 || col === b.across + 1 || row === 0 || row === b.down + 1).toBe(true);
    cells.add(`${col},${row}`);
  }
  expect(cells.size).toBe(b.size);
  // Both decks keep 30 cards that fit the board, with fixed cash still summing to about zero.
  for (const cards of [CHANCE_CARDS, EVENT_CARDS]) {
    const fit = cards.filter((c) => cardFits(c, b));
    expect(fit.length, where).toBeGreaterThanOrEqual(BALANCE.minDeckSize);
    const sum = fit.reduce((total, c) => {
      const e = c.effect;
      return 'amount' in e && e.type !== 'perAssetCash' ? total + e.amount : total;
    }, 0);
    expect(Math.abs(sum), where).toBeLessThanOrEqual(50);
    for (const card of cards.filter((c) => !cardFits(c, b))) {
      expect(card.effect.type, `${where}: ${card.id}`).toBe('companyOwnerCash');
    }
  }
}

describe('every board size and shape', () => {
  test('the builder accepts 40 to 80 spaces: a square in steps of 4, a rectangle in steps of 2', () => {
    const boards = validBoards();
    expect(boards.filter((v) => v.shape === 'square').map((v) => v.size)).toEqual([40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80]);
    expect(boards.filter((v) => v.shape === 'rectangle')).toHaveLength(21);
    for (const { size, shape } of boards) checkBoard(buildBoard(size, shape));
  });

  test('other sizes are refused with a sentence that says what to change', () => {
    expect(boardProblem(62, 'square')).toMatch(/divides by 4 \(such as 60 or 64\)/);
    expect(boardProblem(61, 'rectangle')).toMatch(/even BOARD_SIZE/);
    expect(boardProblem(84, 'square')).toMatch(/from 40 to 80.*more cities/);
    expect(boardProblem(36, 'square')).toMatch(/from 40 to 80/);
    expect(boardProblem(60, 'round' as never)).toMatch(/'square' or 'rectangle'/);
    expect(() => buildBoard(62, 'square')).toThrow(/divides by 4/);
  });
});

describe('the board in play', () => {
  test('is the board BOARD_SIZE and BOARD_SHAPE choose', () => {
    expect(LAYOUT).toEqual(buildBoard(BOARD_SIZE, BOARD_SHAPE));
    checkBoard(LAYOUT);
    expect(BOARD).toBe(LAYOUT.spaces);
    expect(CORNERS).toEqual(LAYOUT.corners);
    expect(SPACES).toEqual({ start: 0, jail: LAYOUT.corners[1], vacation: LAYOUT.corners[2], goToJail: LAYOUT.corners[3] });
    expect(PROPERTY_SPACES).toHaveLength(LAYOUT.cities.length + LAYOUT.airports.length + LAYOUT.companies.length);
    expect(Object.values(COUNTRY_CITIES).flat()).toHaveLength(LAYOUT.cities.length);
    for (let i = 0; i < BOARD_SIZE; i++) expect(gridPosition(i)).toEqual(gridPositionOn(LAYOUT, i));
    expect(propertyName(LAYOUT.cities[0]?.space as number)).toBe('Brasília');
  });

  test('the decks hold the cards that fit it', () => {
    for (const deck of ['chance', 'event'] as const) {
      const all = deck === 'chance' ? CHANCE_CARDS : EVENT_CARDS;
      expect(cardsForSettings(deck, DEFAULT_SETTINGS)).toEqual(all.filter((c) => cardFits(c, LAYOUT)));
    }
  });
});

describe('property data', () => {
  test('rent multipliers, hotel cost and mortgage maths', () => {
    expect(BALANCE.cityRentMultipliers).toEqual([2, 4, 7, 11, 15, 20]);
    expect(BALANCE.hotelCostMultiplier).toBe(2);
    expect(mortgageValue(430)).toBe(215);
    expect(unmortgageCost(430)).toBe(237);
    // Integer maths: 100 × 1.1 must be 110, not 111.
    expect(unmortgageCost(200)).toBe(110);
    for (const city of ALL_CITIES) {
      expect(unmortgageCost(city.price)).toBe(Math.ceil((mortgageValue(city.price) * 110) / 100 - 1e-9));
    }
  });
});
