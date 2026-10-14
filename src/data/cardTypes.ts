// Card data shapes (spec section 6). Only these effect types exist.
import type { CompanyId } from './companies.js';
import type { CountryId } from './countries.js';
import type { TransportKind } from './myanmar.js';

export type DeckId = 'chance' | 'event';
export type CardTone = 'good' | 'bad' | 'neutral';
export type ModifierType =
  | 'cityRent'
  | 'airportRent'
  | 'companyRent'
  | 'buildCost'
  /** Myanmar map: rent of some regions (the card names them). */
  | 'groupRent'
  /** Myanmar map: rent of one kind of transport (the card names it). */
  | 'transportRent';
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
  /** `rentFactor`: rent where the player lands is multiplied (Myanmar's nearest airport card). */
  | { type: 'moveTo'; target: MoveTarget; rentFactor?: number }
  | { type: 'goToJail' }
  | { type: 'goToVacation' }
  | { type: 'rollAgain' }
  | { type: 'freeStay' }
  | { type: 'freeHouseVoucher' }
  | { type: 'getOutOfJail' }
  | { type: 'perBuildingFee'; house: number; hotel: number }
  | { type: 'companyOwnerCash'; company: CompanyId; amount: number }
  | { type: 'perAssetCash'; kind: AssetKind; amount: number }
  | { type: 'modifier'; modifier: ModifierType; factor: number }
  /** Myanmar map: these regions' city rents are multiplied until the drawer's next turn. */
  | { type: 'groupRent'; groups: readonly CountryId[]; factor: number }
  /** Myanmar map: this kind of transport earns nothing until the drawer's next turn. */
  | { type: 'transportClosed'; kind: TransportKind };

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
  /** Myanmar map cards: the title and text in Burmese (D101). */
  titleMy?: string;
  textMy?: string;
  icon: CardIcon;
  tone: CardTone;
  effect: CardEffect;
}
