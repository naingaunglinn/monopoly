// Board and property data (spec sections 3 and 4). The tables below are an independent copy of
// the spec so that a typo in src/data fails here.
import { describe, expect, test } from 'vitest';
import { AIRPORTS } from '../../src/data/airports';
import { BALANCE, mortgageValue, unmortgageCost } from '../../src/data/balance';
import { BOARD, CORNERS, COUNTRY_CITIES, gridPosition, PROPERTY_SPACES } from '../../src/data/board';
import { CITIES } from '../../src/data/cities';
import { COMPANIES } from '../../src/data/companies';
import { COUNTRIES } from '../../src/data/countries';

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

const countryName = (id: string) => COUNTRIES.find((c) => c.id === id)?.name;

describe('board', () => {
  test('has exactly 80 spaces with the specified counts', () => {
    expect(BOARD).toHaveLength(80);
    BOARD.forEach((space, i) => expect(space.index).toBe(i));
    const count = (type: string) => BOARD.filter((s) => s.type === type).length;
    expect(count('city')).toBe(42);
    expect(count('airport')).toBe(10);
    expect(count('company')).toBe(8);
    expect(80 - 42 - 10 - 8).toBe(20);
    expect(count('chance')).toBe(6);
    expect(count('event')).toBe(7);
    expect(count('tax')).toBe(2);
    for (const type of ['start', 'jail', 'goToJail', 'vacation', 'freeParking']) expect(count(type)).toBe(1);
    expect(PROPERTY_SPACES).toHaveLength(60);
  });

  test('special spaces sit at their fixed indices', () => {
    for (const [index, type] of SPEC_SPECIALS) expect(BOARD[index]?.type).toBe(type);
    const income = BOARD[5];
    const luxury = BOARD[65];
    expect(income?.type === 'tax' && income.tax).toBe('income');
    expect(luxury?.type === 'tax' && luxury.tax).toBe('luxury');
    expect(CORNERS).toEqual([0, 17, 40, 57]);
  });

  test('countries appear in the specified clockwise order', () => {
    const order: string[] = [];
    for (const space of BOARD) {
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
    expect(COUNTRIES.map((c) => c.name)).toEqual(order);
    expect(new Set(order).size).toBe(16);
  });

  test('each company sits between its two countries', () => {
    for (const company of COMPANIES) {
      let before = company.space - 1;
      while (BOARD[before]?.type !== 'city') before--;
      let after = company.space + 1;
      while (BOARD[after]?.type !== 'city') after++;
      const b = BOARD[before];
      const a = BOARD[after];
      expect(b?.type === 'city' && b.city.country).toBe(company.between[0]);
      expect(a?.type === 'city' && a.city.country).toBe(company.between[1]);
    }
  });

  test('index-to-grid mapping follows the geometry table', () => {
    expect(gridPosition(0)).toMatchObject({ col: 0, row: 0, corner: true });
    expect(gridPosition(9)).toMatchObject({ col: 9, row: 0 });
    expect(gridPosition(17)).toMatchObject({ col: 17, row: 0, corner: true });
    expect(gridPosition(18)).toMatchObject({ col: 17, row: 1 });
    expect(gridPosition(40)).toMatchObject({ col: 17, row: 23, corner: true });
    expect(gridPosition(41)).toMatchObject({ col: 16, row: 23 });
    expect(gridPosition(57)).toMatchObject({ col: 0, row: 23, corner: true });
    expect(gridPosition(58)).toMatchObject({ col: 0, row: 22 });
    expect(gridPosition(79)).toMatchObject({ col: 0, row: 1 });
    const cells = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const { col, row } = gridPosition(i);
      expect(col === 0 || col === 17 || row === 0 || row === 23).toBe(true);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(18);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(24);
      cells.add(`${col},${row}`);
    }
    // 80 distinct cells: the whole ring of an 18 × 24 grid.
    expect(cells.size).toBe(80);
    expect(2 * 18 + 2 * 22).toBe(80);
  });
});

describe('property data', () => {
  test('cities match the spec exactly', () => {
    expect(CITIES).toHaveLength(42);
    expect(
      CITIES.map((c) => [countryName(c.country), c.name, c.space, c.price, c.baseRent, c.houseCost]),
    ).toEqual(SPEC_CITIES);
    for (const city of CITIES) expect(BOARD[city.space]?.type).toBe('city');
    expect(Object.values(COUNTRY_CITIES).flat()).toHaveLength(42);
  });

  test('airports match the spec exactly', () => {
    expect(AIRPORTS.map((a) => [a.name, a.space, a.price])).toEqual(SPEC_AIRPORTS);
    expect(BALANCE.airportRent).toEqual([40, 90, 160, 250, 350, 475, 625, 800, 1000, 1250]);
  });

  test('companies match the spec exactly', () => {
    expect(
      COMPANIES.map((c) => [c.name, c.space, countryName(c.between[0]), countryName(c.between[1]), c.price, c.multiplier]),
    ).toEqual(SPEC_COMPANIES);
  });

  test('rent multipliers, hotel cost and mortgage maths', () => {
    expect(BALANCE.cityRentMultipliers).toEqual([2, 4, 7, 11, 15, 20]);
    expect(BALANCE.hotelCostMultiplier).toBe(2);
    expect(mortgageValue(430)).toBe(215);
    expect(unmortgageCost(430)).toBe(237);
    // Integer maths: 100 × 1.1 must be 110, not 111.
    expect(unmortgageCost(200)).toBe(110);
    for (const city of CITIES) {
      expect(unmortgageCost(city.price)).toBe(Math.ceil((mortgageValue(city.price) * 110) / 100 - 1e-9));
    }
  });
});
