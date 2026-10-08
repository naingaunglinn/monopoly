// Every UI string lives here so another language can be added later (spec section 2).
// Plain data and pure formatting functions only: no React, no DOM.
import type { ErrorCode, ErrorParams } from '../engine/types';

export const GAME_TITLE = 'Global Monopoly';
export const TAGLINE = 'Build your global empire';

const MINUS = '−';

/** $1,250 */
export function money(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  return `${amount < 0 ? MINUS : ''}$${abs.toLocaleString('en-US')}`;
}

/** +$500 or −$300. Money always carries a sign and a symbol. */
export function signedMoney(amount: number): string {
  if (amount === 0) return '$0';
  return `${amount > 0 ? '+' : MINUS}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

function p(params: ErrorParams, key: string): string {
  const v = params[key];
  return v === undefined ? '' : String(v);
}

function m(params: ErrorParams, key: string): string {
  const v = params[key];
  return typeof v === 'number' ? money(v) : String(v ?? '');
}

export const ERROR_TEXT: Readonly<Record<ErrorCode, (params: ErrorParams) => string>> = {
  gameOver: () => 'The game is over.',
  wrongPhase: () => 'That is not possible right now.',
  noticePending: () => 'Press OK first.',
  tradePending: (x) => `${p(x, 'player')} must answer the trade offer first.`,
  notEnoughCash: (x) => `You don't have enough money. You need ${m(x, 'needed')} and have ${m(x, 'have')}.`,
  notProperty: () => 'That space cannot be owned.',
  notOwner: (x) => `${p(x, 'name')} is not yours.`,
  notCity: () => 'Only cities can have houses and hotels.',
  alreadyMortgaged: (x) => `${p(x, 'name')} is already mortgaged.`,
  notMortgaged: (x) => `${p(x, 'name')} is not mortgaged.`,
  countryHasBuildings: (x) => `Sell the buildings in ${p(x, 'country')} first.`,
  countryIncomplete: (x) => `You need every city in ${p(x, 'country')} before building.`,
  countryMortgaged: (x) => `Unmortgage ${p(x, 'name')} before building in ${p(x, 'country')}.`,
  notLandedHere: () => 'You can build only on the city you have just landed on, during that move.',
  evenBuild: (x) => `Your other ${p(x, 'country')} cities must have the same number of houses first.`,
  hasHotel: (x) => `${p(x, 'name')} already has a hotel.`,
  noBuildings: (x) => `${p(x, 'name')} has no buildings to sell.`,
  evenSell: (x) => `Sell evenly: start with the ${p(x, 'country')} city that has the most buildings.`,
  noJailCard: () => 'You have no Get Out of Jail card.',
  bidTooLow: (x) => `Your bid must be at least ${m(x, 'min')}.`,
  bidTooHigh: (x) => `You can't bid more than your cash (${m(x, 'cash')}).`,
  invalidAmount: () => 'Enter a whole number of dollars.',
  freeStayUnavailable: () => 'Free Stay can be used only on another player\'s city, and you need a token.',
  debtNotCovered: (x) => `You still need ${m(x, 'shortfall')} more to pay.`,
  tradeInvalidPlayer: () => 'Pick another player who is still in the game.',
  tradeEmpty: () => 'Add at least one item to the trade.',
  tradeNotOwned: (x) => `${p(x, 'name')} does not belong to ${p(x, 'player')}.`,
  tradeBuildings: (x) => `Sell the buildings in ${p(x, 'country')} before trading ${p(x, 'name')}.`,
  tradeCash: (x) => `${p(x, 'player')} doesn't have ${m(x, 'amount')}.`,
  tradeCards: (x) => `${p(x, 'player')} doesn't have that many Get Out of Jail cards.`,
  noUnmortgageInDebt: () => 'Pay your debt before unmortgaging.',
  invalidAction: () => 'That action is not available.',
};

export function errorText(code: ErrorCode, params: ErrorParams): string {
  return ERROR_TEXT[code](params);
}
