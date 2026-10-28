// The Yangon map (D116): the Myanmar map's 48-space board and rules with Yangon townships, transport
// and pagodas, in Burmese only. Spaces are found by name.
import { afterEach, describe, expect, test } from 'vitest';
import { BOARD, CITIES, COUNTRIES, LAYOUT, MAP, MAPS, RULES, SPACES, mapIdOf, propertyName, setActiveMap } from '../../src/data/board';
import { language } from '../../src/data/lang';
import { YANGON_CITIES, YANGON_TRANSPORT } from '../../src/data/yangon';
import { YANGON_CHANCE, YANGON_NEWS } from '../../src/data/yangonCards';
import { cardsForSettings, checkInvariants, parseSave } from '../../src/engine';
import { simulateGame } from '../../src/sim/runner';
import { game, spaceOf } from './helpers';

const ygn = (seed = 7) => game({ map: 'yangon', playerCount: 5 }, seed);
const BURMESE = /^[က-႟\s A-Za-z0-9.–-]+$/u;

afterEach(() => setActiveMap('world'));

describe('the Yangon map', () => {
  test('a game starts on 48 spaces with the Myanmar rules', () => {
    const s = ygn();
    expect(s.meta.settings.map).toBe('yangon');
    expect(s.meta.settings.board).toEqual({ spaces: 48, shape: 'square' });
    expect(s.meta.settings.freeStay).toBe(false);
    expect(s.meta.settings.vacation).toBe(false);
    expect(MAP.id).toBe('yangon');
    expect(RULES).toBe(MAPS.myanmar.rules);
    expect(LAYOUT).toMatchObject({ size: 48, across: 11, down: 11 });
    expect(SPACES).toEqual({ start: 0, jail: 12, vacation: 24, goToJail: 36 });
    expect(BOARD.map((x) => x.index)).toEqual([...Array(48).keys()]);
    expect(CITIES).toHaveLength(25);
    expect(COUNTRIES).toHaveLength(9);
    expect(checkInvariants(s)).toEqual([]);
  });

  test('the same spaces and prices as the Myanmar map', () => {
    const mm = MAPS.myanmar.layout;
    const yg = MAPS.yangon.layout;
    expect(yg.spaces.map((x) => x.type)).toEqual(mm.spaces.map((x) => x.type));
    expect(yg.cities.map((c) => c.price)).toEqual(mm.cities.map((c) => c.price));
    expect(yg.airports.map((a) => a.price)).toEqual(mm.airports.map((a) => a.price));
  });

  test('names are Burmese, and the map reads in Burmese whatever the device chose', () => {
    ygn();
    expect(language()).toBe('my');
    expect(propertyName(spaceOf('ဂိုလ်ဒင်ဗယ်လီ'))).toBe('ဂိုလ်ဒင်ဗယ်လီ');
    for (const c of YANGON_CITIES) expect(c.name).toMatch(BURMESE);
    for (const t of YANGON_TRANSPORT) expect(t.name).toMatch(BURMESE);
    setActiveMap('world');
    expect(language()).toBe('en');
  });

  test('its own Chance and News decks', () => {
    const s = ygn();
    expect(cardsForSettings('chance', s.meta.settings).map((c) => c.id)).toEqual(YANGON_CHANCE.map((c) => c.id));
    expect(cardsForSettings('event', s.meta.settings).map((c) => c.id)).toEqual(YANGON_NEWS.map((c) => c.id));
  });

  test('a save reloads on the Yangon map', () => {
    const s = ygn();
    setActiveMap('world');
    const back = parseSave(JSON.stringify(s));
    expect(back.ok).toBe(true);
  });

  test('mapIdOf: unknown ids are the World map', () => {
    expect(mapIdOf('yangon')).toBe('yangon');
    expect(mapIdOf('myanmar')).toBe('myanmar');
    expect(mapIdOf('mars')).toBe('world');
    expect(mapIdOf(undefined)).toBe('world');
  });

  test('seeded bot games finish with invariants checked after every action', () => {
    for (const r of [simulateGame(1, 'quick', { map: 'yangon', players: 5 }), simulateGame(2, 'normal', { map: 'yangon', roundCap: 300 })]) {
      expect(r.finished || r.hitCap).toBe(true);
      expect(r.actions).toBeGreaterThan(50);
    }
  });
});
