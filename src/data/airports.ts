// The 10 airports (spec section 4). Rent depends on how many airports the owner holds (balance.ts).
import type { CountryId } from './countries';

export interface AirportData {
  space: number;
  name: string;
  /** Country whose flag the airport tile shows. Airports belong to no country set. */
  country: CountryId;
  price: number;
}

export const AIRPORTS: readonly AirportData[] = [
  { space: 4, name: 'Brazil Airport', country: 'brazil', price: 100 },
  { space: 9, name: 'Mexico Airport', country: 'mexico', price: 110 },
  { space: 15, name: 'Egypt Airport', country: 'egypt', price: 120 },
  { space: 27, name: 'Italy Airport', country: 'italy', price: 130 },
  { space: 35, name: 'Germany Airport', country: 'germany', price: 140 },
  { space: 39, name: 'Japan Airport', country: 'japan', price: 150 },
  { space: 48, name: 'China Airport', country: 'china', price: 160 },
  { space: 55, name: 'Myanmar Airport', country: 'myanmar', price: 170 },
  { space: 67, name: 'United Kingdom Airport', country: 'unitedKingdom', price: 180 },
  { space: 77, name: 'United States Airport', country: 'unitedStates', price: 200 },
];
