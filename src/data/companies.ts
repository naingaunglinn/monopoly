// The 8 companies (spec section 4). Rent = total of two fresh dice × multiplier. Every board holds
// all eight unless it is smaller than 57 spaces (board.ts).
import type { CountryId } from './countries.js';

export type CompanyId =
  | 'transport'
  | 'oil'
  | 'shipping'
  | 'power'
  | 'trading'
  | 'telecom'
  | 'rice'
  | 'finance';

/** Icon names map to lucide-react icons in the UI. */
export type CompanyIcon = 'truck' | 'fuel' | 'ship' | 'zap' | 'globe' | 'radio' | 'wheat' | 'landmark';

export interface CompanyData {
  /** Index on the board: here on the full 80-space board; board.ts renumbers the board in play. */
  space: number;
  id: CompanyId;
  name: string;
  /** Short name for compact tiles. */
  shortName: string;
  /** The countries of the nearest cities before and after it (board.ts works them out for the board in play). */
  between: readonly [CountryId, CountryId];
  price: number;
  multiplier: number;
  icon: CompanyIcon;
}

export const ALL_COMPANIES: readonly CompanyData[] = [
  { space: 11, id: 'transport', name: 'Transportation Company', shortName: 'Transport', between: ['mexico', 'egypt'], price: 200, multiplier: 25, icon: 'truck' },
  { space: 16, id: 'oil', name: 'Oil Company', shortName: 'Oil', between: ['egypt', 'israel'], price: 180, multiplier: 25, icon: 'fuel' },
  { space: 25, id: 'shipping', name: 'International Shipping Company', shortName: 'Shipping', between: ['spain', 'italy'], price: 280, multiplier: 35, icon: 'ship' },
  { space: 31, id: 'power', name: 'Electricity / Power Grid', shortName: 'Power Grid', between: ['italy', 'germany'], price: 220, multiplier: 30, icon: 'zap' },
  { space: 37, id: 'trading', name: 'Global Trading Company', shortName: 'Trading', between: ['germany', 'japan'], price: 320, multiplier: 40, icon: 'globe' },
  { space: 45, id: 'telecom', name: 'Telecommunications Company', shortName: 'Telecom', between: ['southKorea', 'china'], price: 360, multiplier: 45, icon: 'radio' },
  { space: 51, id: 'rice', name: 'Rice Trading Company', shortName: 'Rice Trading', between: ['china', 'myanmar'], price: 260, multiplier: 35, icon: 'wheat' },
  { space: 73, id: 'finance', name: 'Global Finance Company', shortName: 'Finance', between: ['canada', 'unitedStates'], price: 400, multiplier: 50, icon: 'landmark' },
];
