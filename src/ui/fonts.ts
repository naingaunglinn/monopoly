// Barlow, bundled from @fontsource (no remote fonts). Only the latin woff2 files are imported;
// the build inlines them, so they are available with the network off.
import barlow400 from '@fontsource/barlow/files/barlow-latin-400-normal.woff2';
import barlow500 from '@fontsource/barlow/files/barlow-latin-500-normal.woff2';
import barlow600 from '@fontsource/barlow/files/barlow-latin-600-normal.woff2';
import barlow700 from '@fontsource/barlow/files/barlow-latin-700-normal.woff2';
import semi500 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2';
import semi600 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2';
import cond600 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2';
import cond700 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2';

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

/** Registers and loads every face up front, so nothing is fetched later. */
export function loadFonts(): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  for (const [family, weight, url] of FACES) {
    const face = new FontFace(family, `url(${url}) format('woff2')`, { weight, style: 'normal', display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => undefined);
  }
}
