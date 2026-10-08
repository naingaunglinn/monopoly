import { describe, expect, test } from 'vitest';
import { COUNTRIES } from '../../src/data/countries';
import { contrastRatio, readableInk } from '../../src/ui/contrast';

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
