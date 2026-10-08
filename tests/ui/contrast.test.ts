import { describe, expect, test } from 'vitest';
import { COUNTRIES } from '../../src/data/countries';
import { PLAYER_COLORS, SEATS } from '../../src/data/players';
import { contrastRatio, MORTGAGED_TINT, OWNED_TINT, ownedTileColor, PATH_TINT, readableInk, tint } from '../../src/ui/contrast';

describe('band text contrast (WCAG AA)', () => {
  test('every country band gets white or Ink text at 4.5:1 or better', () => {
    for (const country of COUNTRIES) {
      const ink = readableInk(country.color);
      expect(contrastRatio(country.color, ink), country.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('neighbouring countries are clearly different colours', () => {
    for (let i = 0; i < COUNTRIES.length; i++) {
      const a = COUNTRIES[i] as (typeof COUNTRIES)[number];
      const b = COUNTRIES[(i + 1) % COUNTRIES.length] as (typeof COUNTRIES)[number];
      const diff = [1, 3, 5].reduce(
        (sum, k) => sum + Math.abs(parseInt(a.color.slice(k, k + 2), 16) - parseInt(b.color.slice(k, k + 2), 16)),
        0,
      );
      expect(diff, `${a.name} / ${b.name}`).toBeGreaterThan(90);
    }
  });

  test('the text colours used on light surfaces pass AA', () => {
    const text = { ink: '#14202B', inkSoft: '#5B6875', gainInk: '#137A43', lossInk: '#B42318', amberInk: '#8A4B00', muted: '#5C6670' };
    for (const [name, color] of Object.entries(text)) {
      expect(contrastRatio(color, '#FFFFFF'), name).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color, '#EEF2F5'), `${name} on paper`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('player colours and owned tiles (D53, D54)', () => {
  const INK = '#14202B';
  const INK_SOFT = '#5B6875';
  const AMBER_INK = '#8A4B00';

  test('tint mixes with white like CSS color-mix in srgb', () => {
    expect(tint('#E5484D', 0)).toBe('#FFFFFF');
    expect(tint('#E5484D', 1)).toBe('#E5484D');
    expect(tint('#3E63DD', 0.4)).toBe('#B2C1F1');
    expect(ownedTileColor('#3E63DD', false)).toBe(tint('#3E63DD', OWNED_TINT));
    expect(ownedTileColor('#3E63DD', true)).toBe(tint('#3E63DD', MORTGAGED_TINT));
  });

  test('the palette is the six seat colours plus two, all different', () => {
    expect(PLAYER_COLORS.slice(0, 6)).toEqual(SEATS.map((s) => s.color));
    expect(new Set(PLAYER_COLORS).size).toBe(PLAYER_COLORS.length);
    expect(PLAYER_COLORS.length).toBeGreaterThanOrEqual(SEATS.length);
  });

  test('the white token glyph stands out on every added colour (3:1)', () => {
    // The six seat colours come from the spec; Orange is 2.97:1 and stays as specified.
    for (const color of PLAYER_COLORS.slice(6)) expect(contrastRatio(color, '#FFFFFF'), color).toBeGreaterThanOrEqual(3);
  });

  test('tile text stays readable on every owner tint (AA), icons at 3:1', () => {
    for (const color of PLAYER_COLORS) {
      const owned = ownedTileColor(color, false);
      const mortgaged = ownedTileColor(color, true);
      expect(contrastRatio(INK, owned), `Ink on ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(INK_SOFT, owned), `icons on ${color}`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(INK, mortgaged), `Ink on mortgaged ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(AMBER_INK, mortgaged), `Mortgaged label on ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(INK, tint(color, PATH_TINT)), `Ink under the path light of ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('owner tints are clearly different from white and from each other', () => {
    const rgb = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    const distance = (a: string, b: string) => rgb(a).reduce((sum, v, k) => sum + Math.abs(v - (rgb(b)[k] as number)), 0);
    const tints = PLAYER_COLORS.map((c) => ownedTileColor(c, false));
    for (const t of tints) expect(distance(t, '#FFFFFF'), t).toBeGreaterThan(60);
    for (let i = 0; i < tints.length; i++) {
      for (let j = i + 1; j < tints.length; j++) {
        expect(distance(tints[i] as string, tints[j] as string), `${PLAYER_COLORS[i]} / ${PLAYER_COLORS[j]}`).toBeGreaterThan(30);
      }
    }
  });
});
