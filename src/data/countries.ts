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
  /** Longitude and latitude of the country's first city, for the start-screen route map. */
  at: readonly [number, number];
}

export const COUNTRIES: readonly CountryData[] = [
  { id: 'brazil', name: 'Brazil', colorName: 'Rainforest green', color: '#2F9E63', flag: 'br', at: [-47.9, -15.8] },
  { id: 'mexico', name: 'Mexico', colorName: 'Terracotta', color: '#B8543A', flag: 'mx', at: [-99.1, 19.4] },
  { id: 'egypt', name: 'Egypt', colorName: 'Desert sand', color: '#C9A13E', flag: 'eg', at: [31.2, 30.0] },
  { id: 'israel', name: 'Israel', colorName: 'Sky blue', color: '#4A9FE0', flag: 'il', at: [35.2, 31.8] },
  { id: 'spain', name: 'Spain', colorName: 'Saffron orange', color: '#E3812B', flag: 'es', at: [-3.7, 40.4] },
  { id: 'italy', name: 'Italy', colorName: 'Olive', color: '#7D8F2E', flag: 'it', at: [12.5, 41.9] },
  { id: 'germany', name: 'Germany', colorName: 'Steel grey', color: '#5F6B78', flag: 'de', at: [13.4, 52.5] },
  { id: 'japan', name: 'Japan', colorName: 'Sakura pink', color: '#E06C9A', flag: 'jp', at: [139.7, 35.7] },
  { id: 'southKorea', name: 'South Korea', colorName: 'Jade teal', color: '#2FA3A0', flag: 'kr', at: [127.0, 37.6] },
  { id: 'china', name: 'China', colorName: 'Lacquer red', color: '#C4372F', flag: 'cn', at: [116.4, 39.9] },
  { id: 'myanmar', name: 'Myanmar', colorName: 'Pagoda gold', color: '#E0B21C', flag: 'mm', at: [96.2, 16.8] },
  { id: 'france', name: 'France', colorName: 'Lavender', color: '#7C68C6', flag: 'fr', at: [2.35, 48.9] },
  { id: 'netherlands', name: 'Netherlands', colorName: 'Tulip magenta', color: '#B83F8E', flag: 'nl', at: [4.9, 52.4] },
  { id: 'unitedKingdom', name: 'United Kingdom', colorName: 'Royal blue', color: '#2F4FB5', flag: 'gb', at: [-0.13, 51.5] },
  { id: 'canada', name: 'Canada', colorName: 'Maple brown', color: '#9A5B2C', flag: 'ca', at: [-79.4, 43.7] },
  { id: 'unitedStates', name: 'United States', colorName: 'Midnight navy', color: '#1C2F4F', flag: 'us', at: [-74.0, 40.7] },
];

export const COUNTRY_BY_ID: Readonly<Record<CountryId, CountryData>> = Object.fromEntries(
  COUNTRIES.map((c) => [c.id, c]),
) as Record<CountryId, CountryData>;
