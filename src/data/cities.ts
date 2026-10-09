// The 42 cities of the full board (spec section 4). Hotel cost is always house cost × 2 (see
// balance.ts). The board in play holds all or some of them (board.ts).
import type { CountryId } from './countries.js';

export interface CityData {
  /** Index on the board: here on the full 80-space board; board.ts renumbers the board in play. */
  space: number;
  name: string;
  country: CountryId;
  price: number;
  baseRent: number;
  houseCost: number;
}

export const ALL_CITIES: readonly CityData[] = [
  { space: 1, name: 'Brasília', country: 'brazil', price: 70, baseRent: 7, houseCost: 40 },
  { space: 3, name: 'Rio de Janeiro', country: 'brazil', price: 90, baseRent: 9, houseCost: 40 },
  { space: 6, name: 'Mexico City', country: 'mexico', price: 110, baseRent: 11, houseCost: 45 },
  { space: 8, name: 'Guadalajara', country: 'mexico', price: 130, baseRent: 13, houseCost: 45 },
  { space: 10, name: 'Monterrey', country: 'mexico', price: 150, baseRent: 15, houseCost: 45 },
  { space: 12, name: 'Cairo', country: 'egypt', price: 170, baseRent: 17, houseCost: 50 },
  { space: 14, name: 'Alexandria', country: 'egypt', price: 190, baseRent: 19, houseCost: 50 },
  { space: 18, name: 'Jerusalem', country: 'israel', price: 210, baseRent: 21, houseCost: 55 },
  { space: 20, name: 'Tel Aviv', country: 'israel', price: 230, baseRent: 23, houseCost: 55 },
  { space: 21, name: 'Haifa', country: 'israel', price: 250, baseRent: 25, houseCost: 55 },
  { space: 22, name: 'Madrid', country: 'spain', price: 270, baseRent: 27, houseCost: 60 },
  { space: 24, name: 'Barcelona', country: 'spain', price: 290, baseRent: 29, houseCost: 60 },
  { space: 26, name: 'Rome', country: 'italy', price: 310, baseRent: 31, houseCost: 65 },
  { space: 28, name: 'Milan', country: 'italy', price: 330, baseRent: 33, houseCost: 65 },
  { space: 30, name: 'Venice', country: 'italy', price: 350, baseRent: 35, houseCost: 65 },
  { space: 32, name: 'Berlin', country: 'germany', price: 370, baseRent: 37, houseCost: 70 },
  { space: 33, name: 'Munich', country: 'germany', price: 390, baseRent: 39, houseCost: 70 },
  { space: 36, name: 'Frankfurt', country: 'germany', price: 410, baseRent: 41, houseCost: 70 },
  { space: 38, name: 'Tokyo', country: 'japan', price: 430, baseRent: 43, houseCost: 75 },
  { space: 41, name: 'Osaka', country: 'japan', price: 450, baseRent: 45, houseCost: 75 },
  { space: 43, name: 'Seoul', country: 'southKorea', price: 470, baseRent: 47, houseCost: 80 },
  { space: 44, name: 'Busan', country: 'southKorea', price: 490, baseRent: 49, houseCost: 80 },
  { space: 46, name: 'Beijing', country: 'china', price: 510, baseRent: 51, houseCost: 85 },
  { space: 49, name: 'Shanghai', country: 'china', price: 530, baseRent: 53, houseCost: 85 },
  { space: 50, name: 'Shenzhen', country: 'china', price: 550, baseRent: 55, houseCost: 85 },
  { space: 52, name: 'Yangon', country: 'myanmar', price: 570, baseRent: 57, houseCost: 90 },
  { space: 54, name: 'Mandalay', country: 'myanmar', price: 590, baseRent: 59, houseCost: 90 },
  { space: 56, name: 'Naypyitaw', country: 'myanmar', price: 610, baseRent: 61, houseCost: 90 },
  { space: 58, name: 'Paris', country: 'france', price: 630, baseRent: 63, houseCost: 95 },
  { space: 60, name: 'Lyon', country: 'france', price: 650, baseRent: 65, houseCost: 95 },
  { space: 61, name: 'Marseille', country: 'france', price: 670, baseRent: 67, houseCost: 95 },
  { space: 63, name: 'Amsterdam', country: 'netherlands', price: 680, baseRent: 68, houseCost: 100 },
  { space: 64, name: 'Rotterdam', country: 'netherlands', price: 690, baseRent: 69, houseCost: 100 },
  { space: 66, name: 'London', country: 'unitedKingdom', price: 700, baseRent: 70, houseCost: 105 },
  { space: 68, name: 'Manchester', country: 'unitedKingdom', price: 710, baseRent: 71, houseCost: 105 },
  { space: 69, name: 'Birmingham', country: 'unitedKingdom', price: 720, baseRent: 72, houseCost: 105 },
  { space: 71, name: 'Toronto', country: 'canada', price: 730, baseRent: 73, houseCost: 110 },
  { space: 72, name: 'Vancouver', country: 'canada', price: 740, baseRent: 74, houseCost: 110 },
  { space: 74, name: 'New York', country: 'unitedStates', price: 750, baseRent: 75, houseCost: 115 },
  { space: 76, name: 'Los Angeles', country: 'unitedStates', price: 760, baseRent: 76, houseCost: 115 },
  { space: 78, name: 'Chicago', country: 'unitedStates', price: 770, baseRent: 77, houseCost: 115 },
  { space: 79, name: 'San Francisco', country: 'unitedStates', price: 780, baseRent: 78, houseCost: 115 },
];
