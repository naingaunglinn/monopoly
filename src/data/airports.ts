// The 10 airports (spec section 4). Rent depends on how many airports the owner holds (balance.ts).
import type { CountryId } from './countries.js';

export interface AirportData {
  space: number;
  name: string;
  /** Country name shown beside a plane icon on one-line tiles. */
  shortName: string;
  /** Country whose flag the airport tile shows. Airports belong to no country set. */
  country: CountryId;
  price: number;
}

export const AIRPORTS: readonly AirportData[] = [
  { space: 4, name: 'Brazil Airport', shortName: 'Brazil', country: 'brazil', price: 100 },
  { space: 9, name: 'Mexico Airport', shortName: 'Mexico', country: 'mexico', price: 110 },
  { space: 15, name: 'Egypt Airport', shortName: 'Egypt', country: 'egypt', price: 120 },
  { space: 27, name: 'Italy Airport', shortName: 'Italy', country: 'italy', price: 130 },
  { space: 35, name: 'Germany Airport', shortName: 'Germany', country: 'germany', price: 140 },
  { space: 39, name: 'Japan Airport', shortName: 'Japan', country: 'japan', price: 150 },
  { space: 48, name: 'China Airport', shortName: 'China', country: 'china', price: 160 },
  { space: 55, name: 'Myanmar Airport', shortName: 'Myanmar', country: 'myanmar', price: 170 },
  { space: 67, name: 'United Kingdom Airport', shortName: 'UK', country: 'unitedKingdom', price: 180 },
  { space: 77, name: 'United States Airport', shortName: 'US', country: 'unitedStates', price: 200 },
];
