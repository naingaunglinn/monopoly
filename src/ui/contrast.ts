// Colour helpers. WCAG contrast: text on a country band is white on dark bands and Ink on light ones,
// whichever passes AA (spec section 10). Tints: owned tiles and the path light (D51, D54).
export const INK = '#14202B';
export const WHITE = '#FFFFFF';

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or Ink, whichever contrasts more with the background. */
export function readableInk(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
}

/** Mixes `amount` (0 to 1) of a colour with white, like CSS color-mix(in srgb, …, white). */
export function tint(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const mixed = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * amount + 255 * (1 - amount)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Mixes `amount` (0 to 1) of Ink into a colour (a darker shade of it). */
export function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const ink = INK.replace('#', '');
  const mixed = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - amount) + parseInt(ink.slice(i, i + 2), 16) * amount));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * A player's colour as ink on white paper: darkened towards Ink just enough for small text (AA,
 * 4.5:1), so stamps and chat marks keep the player's hue and stay readable (spec section 18).
 */
export function inkOnPaper(hex: string): string {
  for (let step = 0; step <= 20; step++) {
    const c = shade(hex, step / 20);
    if (contrastRatio(c, WHITE) >= 4.5) return c;
  }
  return INK;
}

/** An owned tile takes this much of its owner's colour (D54); white tiles are for sale. */
export const OWNED_TINT = 0.4;
/** A mortgaged tile is paler, so its amber Mortgaged label still passes AA. */
export const MORTGAGED_TINT = 0.14;
/** The light on tiles a token passes, in the moving player's colour. */
export const PATH_TINT = 0.5;

export function ownedTileColor(owner: string, mortgaged: boolean): string {
  return tint(owner, mortgaged ? MORTGAGED_TINT : OWNED_TINT);
}
