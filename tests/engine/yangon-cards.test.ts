import { describe, expect, it } from 'vitest';
import { MYANMAR_COMPANIES, MYANMAR_SIZE, MYANMAR_SPECIALS } from '../../src/data/myanmar';
import { YANGON_CITIES, YANGON_GROUPS, YANGON_TEMPLES, YANGON_TRANSPORT } from '../../src/data/yangon';
import { YANGON_CHANCE, YANGON_NEWS } from '../../src/data/yangonCards';

const BURMESE = /[က-႟]/;
const cards = [...YANGON_CHANCE, ...YANGON_NEWS];

describe('Yangon map data (D116)', () => {
  it('fills every one of the 48 spaces exactly once', () => {
    const taken = [
      ...YANGON_CITIES.map((c) => c.space),
      ...YANGON_TRANSPORT.map((t) => t.space),
      ...MYANMAR_COMPANIES.map((c) => c.space),
      ...Object.keys(MYANMAR_SPECIALS).map(Number),
    ].sort((a, b) => a - b);
    expect(taken).toEqual(Array.from({ length: MYANMAR_SIZE }, (_, i) => i));
  });

  it('gives every township, area, transport space and pagoda a Burmese name only', () => {
    for (const named of [...YANGON_CITIES, ...YANGON_GROUPS, ...YANGON_TRANSPORT, ...Object.values(YANGON_TEMPLES)]) {
      expect(named.name).toMatch(BURMESE);
      expect(named.nameMy).toBe(named.name);
    }
    expect(Object.keys(YANGON_TEMPLES).map(Number).every((i) => MYANMAR_SPECIALS[i] === 'temple')).toBe(true);
  });

  it('puts every township in a Yangon area, with prices rising around the board', () => {
    const groups = new Set(YANGON_GROUPS.map((g) => g.id));
    for (const c of YANGON_CITIES) expect(groups.has(c.country)).toBe(true);
    const prices = YANGON_CITIES.map((c) => c.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});

describe('Yangon cards (D116)', () => {
  it('have unique ids, the right deck and Burmese text only', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    for (const c of YANGON_CHANCE) expect(c.deck).toBe('chance');
    for (const c of YANGON_NEWS) expect(c.deck).toBe('event');
    for (const c of cards) {
      expect(c.title).toMatch(BURMESE);
      expect(c.text).toMatch(BURMESE);
      expect(c.titleMy).toBe(c.title);
      expect(c.textMy).toBe(c.text);
    }
  });

  it('name only spaces, areas and companies that are on the Yangon board', () => {
    const groups = new Set<string>(YANGON_GROUPS.map((g) => g.id));
    const companies = new Set<string>(MYANMAR_COMPANIES.map((c) => c.id));
    const kinds = new Set<string>(YANGON_TRANSPORT.map((t) => t.kind));
    for (const { effect: e } of cards) {
      if (e.type === 'moveTo' && e.target.kind === 'space') expect(e.target.index).toBeLessThan(MYANMAR_SIZE);
      if (e.type === 'groupRent') for (const g of e.groups) expect(groups.has(g)).toBe(true);
      if (e.type === 'transportClosed') expect(kinds.has(e.kind)).toBe(true);
      if ('company' in e) expect(companies.has(e.company)).toBe(true);
    }
  });

  it('send players where the card says', () => {
    const at = (index: number) => YANGON_CITIES.find((c) => c.space === index)?.name;
    const to = (id: string) => {
      const e = cards.find((c) => c.id === id)?.effect;
      return e?.type === 'moveTo' && e.target.kind === 'space' ? e.target.index : -1;
    };
    expect(at(to('ygn-chance-golden-valley'))).toBe('ဂိုလ်ဒင်ဗယ်လီ');
    expect(at(to('ygn-chance-ybs'))).toBe('ရွှေပြည်သာ');
    expect(at(to('ygn-chance-19th-street'))).toBe('တရုတ်တန်း');
  });
});
