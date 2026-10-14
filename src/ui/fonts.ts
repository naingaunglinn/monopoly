// Barlow, bundled from @fontsource (no remote fonts). Only the latin woff2 files are imported;
// the build inlines them, so they are available with the network off. Burmese (the Myanmar map's
// names and cards, D101) comes from Noto Sans Myanmar's Myanmar-script files, registered under the
// same family names for the Myanmar Unicode blocks only, so Latin text stays in Barlow.
import barlow400 from '@fontsource/barlow/files/barlow-latin-400-normal.woff2';
import barlow500 from '@fontsource/barlow/files/barlow-latin-500-normal.woff2';
import barlow600 from '@fontsource/barlow/files/barlow-latin-600-normal.woff2';
import barlow700 from '@fontsource/barlow/files/barlow-latin-700-normal.woff2';
import semi500 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2';
import semi600 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2';
import cond600 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2';
import cond700 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2';
import myanmar400 from '@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-400-normal.woff2';
import myanmar500 from '@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-500-normal.woff2';
import myanmar600 from '@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-600-normal.woff2';
import myanmar700 from '@fontsource/noto-sans-myanmar/files/noto-sans-myanmar-myanmar-700-normal.woff2';

const FACES: Array<[family: string, weight: string, url: string]> = [
  ['Barlow', '400', barlow400],
  ['Barlow', '500', barlow500],
  ['Barlow', '600', barlow600],
  ['Barlow', '700', barlow700],
  ['Barlow Semi Condensed', '500', semi500],
  ['Barlow Semi Condensed', '600', semi600],
  ['Barlow Condensed', '600', cond600],
  ['Barlow Condensed', '700', cond700],
];

/** Myanmar, Myanmar Extended-A and Extended-B. */
const MYANMAR_RANGE = 'U+1000-109F, U+A9E0-A9FF, U+AA60-AA7F';
const MYANMAR_BY_WEIGHT: Record<string, string> = { '400': myanmar400, '500': myanmar500, '600': myanmar600, '700': myanmar700 };

/** Registers and loads every face up front, so nothing is fetched later. */
export function loadFonts(): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  for (const [family, weight, url] of FACES) {
    const face = new FontFace(family, `url(${url}) format('woff2')`, { weight, style: 'normal', display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => undefined);
    const burmese = new FontFace(family, `url(${MYANMAR_BY_WEIGHT[weight]}) format('woff2')`, {
      weight,
      style: 'normal',
      display: 'swap',
      unicodeRange: MYANMAR_RANGE,
    });
    document.fonts.add(burmese);
    burmese.load().catch(() => undefined);
  }
}
