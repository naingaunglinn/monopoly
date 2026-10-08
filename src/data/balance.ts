// Every rule number used by the engine, setup screen and bots lives here (spec section 9).

export const BOARD_SIZE = 80;

export const SPACES = {
  start: 0,
  jail: 17,
  vacation: 40,
  goToJail: 57,
} as const;

export const BALANCE = {
  /** Paid for passing or landing on World Start (forward moves only). */
  startBonus: 500,
  incomeTax: 300,
  luxuryTax: 500,

  jailFine: 300,
  /** Failed doubles rolls allowed before the fine is forced. */
  jailMaxAttempts: 3,
  /** Doubles in one turn that send a player to Jail. */
  doublesToJail: 3,

  freeStayStart: 3,
  freeStayMax: 3,
  /** Paid instead of a Free Stay token when the player already holds the maximum (or Free Stay is off). */
  freeStayOverflowCash: 100,

  /** Mortgage value = price × mortgagePercent / 100. */
  mortgagePercent: 50,
  /** Unmortgage cost = mortgage value + this percent, rounded up to a whole dollar. */
  unmortgageInterestPercent: 10,

  /** A sold house refunds house cost × this percent (rounded to whole dollars). */
  houseRefundPercent: 50,
  /** A hotel costs house cost × this. */
  hotelCostMultiplier: 2,
  /** A sold hotel refunds house cost × this (50% of the hotel cost). */
  hotelRefundMultiplier: 1,
  /** Building levels: 0 to 4 houses, then a hotel. */
  hotelLevel: 5,
  housesBeforeHotel: 4,

  /** City rent multiplier by building level once the country is complete (index 0 = no building). */
  cityRentMultipliers: [2, 4, 7, 11, 15, 20] as readonly number[],
  /** Airport rent by number of airports owned (index 0 = one airport). */
  airportRent: [40, 90, 160, 250, 350, 475, 625, 800, 1000, 1250] as readonly number[],

  /** Net worth counts a hotel as this many house costs. */
  netWorthHotelHouseCosts: 6,

  auctionRaises: [10, 50, 100] as readonly number[],
  auctionMinBid: 1,

  /** perAssetCash effects are capped at this amount per player. */
  perAssetCashCap: 300,
  modifierFactorMin: 0.5,
  modifierFactorMax: 1.5,
  /** Card balance limits (spec section 6). */
  cardCashLimit: 300,
  cardPerPlayerLimit: 100,
  minDeckSize: 30,
  maxChanceCopiesOfSpecial: 2,

  /** Entries kept in the in-game log (older ones are dropped). */
  logLimit: 200,
} as const;

export const SETUP = {
  playerCounts: [2, 3, 4, 5, 6] as readonly number[],
  defaultPlayerCount: 2,
  startingMoney: [3000, 4000, 5000] as readonly number[],
  defaultStartingMoney: 4000,
  roundLimits: [30, 50, 100] as readonly number[],
  defaultRoundLimit: 50,
  /** Other round limits the engine accepts (the ?rounds=N test hook); setup offers only the list above. */
  minRoundLimit: 1,
  maxRoundLimit: 100,
  maxNameLength: 16,
} as const;

/** Bot behaviour and simulation numbers (spec section 15). */
export const SIM = {
  quickGames: 200,
  normalGames: 200,
  playersPerGame: 4,
  normalRoundCap: 2000,
  sensibleKeepCash: 300,
  sensibleFreeStayAbove: 150,
  sensibleJailFeeAbove: 1000,
  sensibleUnmortgageAbove: 1500,
  /** Non-progress actions (trade, mortgage, sell...) a bot may take before it must make progress. */
  botFreeActionsPerDecision: 4,
} as const;

/** Index into `cityRentMultipliers` etc. is the building level. */
export function mortgageValue(price: number): number {
  return Math.floor((price * BALANCE.mortgagePercent) / 100);
}

/** Mortgage value plus 10%, rounded up, using integer maths (100 × 1.1 must be 110, not 111). */
export function unmortgageCost(price: number): number {
  const m = mortgageValue(price);
  return Math.floor((m * (100 + BALANCE.unmortgageInterestPercent) + 99) / 100);
}

/** Round to whole dollars, halves away from zero. */
export function roundMoney(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}
