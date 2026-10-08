// The 16 countries in clockwise board order (spec section 4) with their band colours (section 10).

export type CountryId =
  | 'brazil'
  | 'mexico'
  | 'egypt'
  | 'israel'
  | 'spain'
  | 'italy'
  | 'germany'
  | 'japan'
  | 'southKorea'
  | 'china'
  | 'myanmar'
  | 'france'
  | 'netherlands'
  | 'unitedKingdom'
  | 'canada'
  | 'unitedStates';

/** ISO 3166-1 alpha-2 codes, used to pick the bundled SVG flag. */
export type FlagCode =
  | 'br'
  | 'mx'
  | 'eg'
  | 'il'
  | 'es'
  | 'it'
  | 'de'
  | 'jp'
  | 'kr'
  | 'cn'
  | 'mm'
  | 'fr'
  | 'nl'
  | 'gb'
  | 'ca'
  | 'us';

export interface CountryData {
  id: CountryId;
  name: string;
  /** Colour name from the identity table. */
  colorName: string;
  /** Band colour. */
  color: string;
  flag: FlagCode;
}

export const COUNTRIES: readonly CountryData[] = [
  { id: 'brazil', name: 'Brazil', colorName: 'Rainforest green', color: '#2F9E63', flag: 'br' },
  { id: 'mexico', name: 'Mexico', colorName: 'Terracotta', color: '#B8543A', flag: 'mx' },
  { id: 'egypt', name: 'Egypt', colorName: 'Desert sand', color: '#C9A13E', flag: 'eg' },
  { id: 'israel', name: 'Israel', colorName: 'Sky blue', color: '#4A9FE0', flag: 'il' },
  { id: 'spain', name: 'Spain', colorName: 'Saffron orange', color: '#E3812B', flag: 'es' },
  { id: 'italy', name: 'Italy', colorName: 'Olive', color: '#7D8F2E', flag: 'it' },
  { id: 'germany', name: 'Germany', colorName: 'Steel grey', color: '#5F6B78', flag: 'de' },
  { id: 'japan', name: 'Japan', colorName: 'Sakura pink', color: '#E06C9A', flag: 'jp' },
  { id: 'southKorea', name: 'South Korea', colorName: 'Jade teal', color: '#2FA3A0', flag: 'kr' },
  { id: 'china', name: 'China', colorName: 'Lacquer red', color: '#C4372F', flag: 'cn' },
  { id: 'myanmar', name: 'Myanmar', colorName: 'Pagoda gold', color: '#E0B21C', flag: 'mm' },
  { id: 'france', name: 'France', colorName: 'Lavender', color: '#7C68C6', flag: 'fr' },
  { id: 'netherlands', name: 'Netherlands', colorName: 'Tulip magenta', color: '#B83F8E', flag: 'nl' },
  { id: 'unitedKingdom', name: 'United Kingdom', colorName: 'Royal blue', color: '#2F4FB5', flag: 'gb' },
  { id: 'canada', name: 'Canada', colorName: 'Maple brown', color: '#9A5B2C', flag: 'ca' },
  { id: 'unitedStates', name: 'United States', colorName: 'Midnight navy', color: '#1C2F4F', flag: 'us' },
];

export const COUNTRY_BY_ID: Readonly<Record<CountryId, CountryData>> = Object.fromEntries(
  COUNTRIES.map((c) => [c.id, c]),
) as Record<CountryId, CountryData>;
