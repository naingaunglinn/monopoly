// Card data shapes (spec section 6). Only these effect types exist.
import type { CompanyId } from './companies.js';
import type { CountryId } from './countries.js';

export type DeckId = 'chance' | 'event';
export type CardTone = 'good' | 'bad' | 'neutral';
export type ModifierType = 'cityRent' | 'airportRent' | 'companyRent' | 'buildCost';
export type AssetKind = 'airport' | 'company' | 'city';

export type MoveTarget =
  | { kind: 'nearestAirport' }
  | { kind: 'nearestCompany' }
  | { kind: 'country'; country: CountryId }
  | { kind: 'space'; index: number };

export type CardEffect =
  | { type: 'cash'; amount: number }
  | { type: 'allPlayersCash'; amount: number }
  | { type: 'cashPerPlayer'; amount: number }
  | { type: 'move'; steps: number }
  | { type: 'moveTo'; target: MoveTarget }
  | { type: 'goToJail' }
  | { type: 'goToVacation' }
  | { type: 'rollAgain' }
  | { type: 'freeStay' }
  | { type: 'freeHouseVoucher' }
  | { type: 'getOutOfJail' }
  | { type: 'perBuildingFee'; house: number; hotel: number }
  | { type: 'companyOwnerCash'; company: CompanyId; amount: number }
  | { type: 'perAssetCash'; kind: AssetKind; amount: number }
  | { type: 'modifier'; modifier: ModifierType; factor: number };

export type CardEffectType = CardEffect['type'];

/** Semantic icon keys; the UI maps them to bundled interface icons. */
export type CardIcon =
  | 'moneyIn'
  | 'moneyOut'
  | 'flight'
  | 'luggage'
  | 'route'
  | 'train'
  | 'ship'
  | 'house'
  | 'vacation'
  | 'jail'
  | 'pass'
  | 'group'
  | 'dinner'
  | 'gift'
  | 'trendUp'
  | 'trendDown'
  | 'oil'
  | 'power'
  | 'rice'
  | 'telecom'
  | 'finance'
  | 'construction'
  | 'medical'
  | 'tax'
  | 'business'
  | 'globe'
  | 'storm'
  | 'bed'
  | 'dice'
  | 'start'
  | 'camera'
  | 'map'
  | 'truck';

export interface CardData {
  id: string;
  deck: DeckId;
  title: string;
  text: string;
  icon: CardIcon;
  tone: CardTone;
  effect: CardEffect;
}
