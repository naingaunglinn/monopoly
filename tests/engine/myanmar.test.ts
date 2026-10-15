// The Myanmar map (owner's spec, D101), stage 1: its board, prices, rents, Start, taxes and first
// cards; and the World and Myanmar maps played side by side in one process without touching each
// other. Spaces are found by name.
import { describe, expect, test } from 'vitest';
import { MYANMAR } from '../../src/data/balance';
import { BOARD, CITIES, COUNTRIES, COUNTRY_CITIES, LAYOUT, MAP, SPACES, setActiveMap } from '../../src/data/board';
import { MYANMAR_CITIES, MYANMAR_COMPANIES, MYANMAR_TEMPLES, MYANMAR_TRANSPORT } from '../../src/data/myanmar';
import { MYANMAR_CHANCE, MYANMAR_NEWS } from '../../src/data/myanmarCards';
import {
  airportRent,
  buildCost,
  cardsForSettings,
  checkInvariants,
  cityRent,
  companyRent,
  createGame,
  legalActions,
  reduce,
  type Action,
  type GameState,
} from '../../src/engine';
import { mulberry32 } from '../../src/engine/rng';
import { act, cashOf, forceCard, game, levels, own, rollTo, run, spaceOf, spacesOf } from './helpers';

const mm = (settings: Parameters<typeof game>[0] = {}, seed = 7) => game({ map: 'myanmar', playerCount: 2, ...settings }, seed);

describe('the Myanmar board', () => {
  test('48 spaces, eleven along each side, its four corners', () => {
    const s = mm();
    expect(s.properties).toHaveLength(48);
    expect(s.meta.settings.board).toEqual({ spaces: 48, shape: 'square' });
    expect(LAYOUT).toMatchObject({ size: 48, across: 11, down: 11 });
    expect(SPACES).toEqual({ start: 0, jail: 12, vacation: 24, goToJail: 36 });
    expect(BOARD.map((x) => x.index)).toEqual([...Array(48).keys()]);
  });

  test('33 properties: 25 cities in nine regions, 4 transport spaces at 200 lakh, 4 companies at 250', () => {
    mm();
    expect(CITIES).toHaveLength(25);
    expect(spacesOf('airport')).toHaveLength(4);
    expect(spacesOf('company')).toHaveLength(4);
    expect(spacesOf('temple')).toHaveLength(3);
    expect(COUNTRIES.map((c) => c.name)).toEqual(['Chin', 'Kachin', 'Anyar', 'Rakhine', 'Southern', 'Delta', 'Shan', 'Mandalay', 'Yangon']);
    expect(COUNTRIES.map((c) => COUNTRY_CITIES[c.id].length)).toEqual([2, 3, 3, 2, 3, 3, 3, 3, 3]);
    expect(MYANMAR_TRANSPORT.map((t) => t.price)).toEqual([200, 200, 200, 200]);
    expect(MYANMAR_COMPANIES.map((c) => c.price)).toEqual([250, 250, 250, 250]);
    // Prices rise around the board, base rent is a tenth of the price, every name is also in Burmese.
    const prices = MYANMAR_CITIES.map((c) => c.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices[0]).toBe(60);
    expect(prices[24]).toBe(830);
    for (const c of MYANMAR_CITIES) {
      expect(c.baseRent).toBe(c.price / 10);
      expect(c.nameMy.length).toBeGreaterThan(0);
    }
    expect(Object.values(MYANMAR_TEMPLES).map((t) => t.name)).toEqual(['Shwedagon Pagoda', 'Kyaiktiyo Pagoda', 'Mahamuni Pagoda']);
  });

  test('no Free Stay and no Vacation on this map, whatever the settings say', () => {
    const s = mm({ freeStay: true, vacation: true });
    expect(s.meta.settings).toMatchObject({ map: 'myanmar', freeStay: false, vacation: false });
    expect(s.players.every((p) => p.freeStay === 0)).toBe(true);
  });

  test('its own decks: the Myanmar Chance and News cards only', () => {
    const s = mm();
    expect(cardsForSettings('chance', s.meta.settings).map((c) => c.id)).toEqual(MYANMAR_CHANCE.map((c) => c.id));
    expect(cardsForSettings('event', s.meta.settings).map((c) => c.id)).toEqual(MYANMAR_NEWS.map((c) => c.id));
    const world = cardsForSettings('chance', game().meta.settings).concat(cardsForSettings('event', game().meta.settings));
    expect(world.some((c) => c.id.startsWith('mm-'))).toBe(false);
    for (const card of [...MYANMAR_CHANCE, ...MYANMAR_NEWS]) {
      expect(card.titleMy?.length).toBeGreaterThan(0);
      expect(card.textMy?.length).toBeGreaterThan(0);
    }
  });
});

describe('Myanmar rules', () => {
  test('city rent: a tenth of the price, then the same multipliers as the World map; a hotel costs two houses', () => {
    let s = mm();
    const [meiktila, pyinOoLwin, mandalay] = [spaceOf('Meiktila'), spaceOf('Pyin Oo Lwin'), spaceOf('Mandalay')];
    s = own(s, [meiktila], 1);
    expect(cityRent(s, meiktila).amount).toBe(68);
    s = own(s, [pyinOoLwin, mandalay], 1);
    expect(cityRent(s, mandalay).amount).toBe(74 * 2);
    const rents = [1, 2, 3, 4, 5].map((level) => cityRent(levels(s, [[meiktila, level], [pyinOoLwin, level], [mandalay, level]]), mandalay).amount);
    expect(rents).toEqual([74 * 4, 74 * 7, 74 * 11, 74 * 15, 74 * 20]);
    expect(buildCost(s, mandalay, 1)).toBe(200);
    expect(buildCost(s, mandalay, 5)).toBe(400);
  });

  test('transport rent 50, 100, 200, 400 by how many the owner holds', () => {
    let s = mm();
    const transport = spacesOf('airport');
    const rents: number[] = [];
    for (let n = 1; n <= 4; n++) {
      s = own(s, transport.slice(0, n), 1);
      rents.push(airportRent(s, transport[0] as number).amount);
    }
    expect(rents).toEqual(MYANMAR.transportRent);
  });

  test('company rent: the dice total times 25, 50, 100 or 200 by how many companies the owner holds', () => {
    let s = mm();
    const companies = spacesOf('company');
    const rents: number[] = [];
    for (let n = 1; n <= 4; n++) {
      s = own(s, companies.slice(0, n), 1);
      rents.push(companyRent(s, companies[0] as number, [3, 4]).amount);
    }
    expect(rents).toEqual([7 * 25, 7 * 50, 7 * 100, 7 * 200]);
  });

  test('passing Start pays 500 lakh; Income tax costs 300 and Special tax 500', () => {
    // From space 45, a 3 and a 4 pass Start and land on space 4 (Yangon International Airport).
    const s = act(mm(), { type: 'debug', op: 'movePlayer', player: 0, space: 45 } as Action, { type: 'debug', op: 'setNextDice', dice: [3, 4] } as Action);
    const before = cashOf(s, 0);
    const passed = run(s, { type: 'roll' });
    expect(passed.events.find((e) => e.type === 'passedStart')).toMatchObject({ amount: 500 });
    expect(cashOf(passed.state, 0)).toBe(before + 500);

    const [income, special] = [BOARD.find((x) => x.type === 'tax' && x.tax === 'income')!.index, BOARD.find((x) => x.type === 'tax' && x.tax === 'luxury')!.index];
    for (const [space, tax] of [[income, 300], [special, 500]] as const) {
      const landed = rollTo(mm(), space).state;
      const paid = act(landed, { type: 'payRent' });
      expect(cashOf(landed, 0) - cashOf(paid, 0)).toBe(tax);
    }
  });

  test('"Fly from the nearest airport" goes to an airport (not the Expressway or the border), passing Start pays, rent is doubled', () => {
    const yangonAirport = (mm(), spaceOf('Yangon International Airport'));
    let s = own(mm(), [yangonAirport], 1);
    s = forceCard(s, 'mm-chance-airport');
    // The last Chance space: the next airport is past Start, beyond the Muse Border Gate.
    const chance = spacesOf('chance').at(-1) as number;
    s = rollTo(s, chance).state;
    expect(s.flow.pending).toMatchObject({ kind: 'card', cardId: 'mm-chance-airport' });
    const cash = cashOf(s, 0);
    const moved = run(s, { type: 'confirmCard' });
    expect(moved.state.players[0]?.position).toBe(yangonAirport);
    expect(moved.events.find((e) => e.type === 'passedStart')).toMatchObject({ amount: 500 });
    expect(moved.state.flow.pending).toMatchObject({ kind: 'rent' });
    const pending = moved.state.flow.pending as { rent: { amount: number } };
    expect(pending.rent.amount).toBe(2 * 50);
    const paid = act(moved.state, { type: 'payRent' });
    expect(cashOf(paid, 0)).toBe(cash + 500 - 100);
  });

  test('News: tourist season doubles Rakhine and Shan rents only; border trade closed stops the Muse gate', () => {
    const [kyaukphyu, lashio, pathein, muse] = (mm(), ['Kyaukphyu', 'Lashio', 'Pathein', 'Muse Border Gate'].map(spaceOf));
    const owned = own(mm(), [kyaukphyu, lashio, pathein, muse as number], 1);
    const news = spacesOf('event')[0] as number;
    const tourism = act(rollTo(forceCard(owned, 'mm-event-tourism'), news).state, { type: 'confirmCard' });
    expect(cityRent(tourism, kyaukphyu as number).amount).toBe(33 * 2);
    expect(cityRent(tourism, lashio as number).amount).toBe(59 * 2);
    expect(cityRent(tourism, pathein as number).amount).toBe(53);
    const border = act(rollTo(forceCard(owned, 'mm-event-border'), news).state, { type: 'confirmCard' });
    expect(airportRent(border, muse as number).amount).toBe(0);
    expect(airportRent(owned, muse as number).amount).toBe(50);
  });
});

describe('the World and Myanmar maps in one process', () => {
  /** Plays `steps` legal actions chosen by a seeded picker (no trades: they need an offer). */
  function step(s: GameState, pick: number): GameState {
    const legal = legalActions(s).filter((a) => a.type !== 'proposeTrade' && a.type !== 'counterTrade' && a.type !== 'requestLoan' && a.type !== 'counterLoan') as Action[];
    const action = legal[pick % legal.length] as Action;
    const r = reduce(s, action);
    if (r.error) throw new Error(r.error.reason);
    return r.state;
  }

  function play(start: GameState, steps: number, seed: number): GameState {
    let s = start;
    let r = seed;
    for (let i = 0; i < steps && s.flow.phase !== 'GameOver'; i++) {
      const next = mulberry32(r);
      r = next.next;
      s = step(s, Math.floor(next.value * 1000));
    }
    return s;
  }

  test('games on both maps, played in turns, end exactly as when each is played alone', () => {
    const worldStart = createGame({ playerCount: 4, passDevice: false }, 5);
    const myanmarStart = createGame({ playerCount: 4, passDevice: false, map: 'myanmar' }, 5);
    const worldAlone = play(worldStart, 1500, 1);
    const myanmarAlone = play(myanmarStart, 1500, 2);

    let world = worldStart;
    let myanmar = myanmarStart;
    let rw = 1;
    let rm = 2;
    for (let i = 0; i < 1500; i++) {
      if (world.flow.phase !== 'GameOver') {
        const next = mulberry32(rw);
        rw = next.next;
        world = step(world, Math.floor(next.value * 1000));
      }
      if (myanmar.flow.phase !== 'GameOver') {
        const next = mulberry32(rm);
        rm = next.next;
        myanmar = step(myanmar, Math.floor(next.value * 1000));
      }
    }
    expect(world).toEqual(worldAlone);
    expect(myanmar).toEqual(myanmarAlone);
    expect(world.properties).toHaveLength(60);
    expect(myanmar.properties).toHaveLength(48);
    expect(checkInvariants(world)).toEqual([]);
    expect(checkInvariants(myanmar)).toEqual([]);
  });

  test('an engine call switches to its game’s map, whatever the map in play was', () => {
    const myanmar = createGame({ map: 'myanmar' }, 3);
    setActiveMap('world');
    expect(legalActions(myanmar).length).toBeGreaterThan(0);
    expect(MAP.id).toBe('myanmar');
    expect(checkInvariants(createGame({}, 3))).toEqual([]);
    expect(MAP.id).toBe('world');
  });
});
