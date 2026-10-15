// Every rule number used by the engine, setup screen and bots lives here (spec section 9).

export type BoardShape = 'square' | 'rectangle';

/**
 * Spaces around the board. 80 is the full board of spec section 3, with all 42 cities; a smaller
 * board, down to 40, leaves out whole countries, some airports and some special spaces (the order
 * is LEAVE_OUT in board.ts). Raise it to bring cities back. A board above 80 needs more cities in
 * cities.ts first. A square board needs a number that divides by 4, a rectangle an even number.
 * A different board cannot load games saved on this one (D96).
 */
export const BOARD_SIZE: number = 60;

/**
 * 'square': the same number of spaces along every side (14 on the 60-space board).
 * 'rectangle': more spaces down the left and right sides than across the top and bottom, in the
 * full board's proportion of 22 to 16.
 */
export const BOARD_SHAPE: BoardShape = 'square';

export const BALANCE = {
  /** Paid for passing or landing on World Start (forward moves only). $1,000 at the owner's request (D100). */
  startBonus: 1000,
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
  /** Myanmar map: the sensible bot takes a bribe of at least this much (D107). */
  sensibleBribeAbove: 300,
  /** Myanmar map: the sensible bot spends a merit point on rent of at least this much. */
  sensibleMeritRentAbove: 400,
  /** Non-progress actions (trade, mortgage, sell...) a bot may take before it must make progress. */
  botFreeActionsPerDecision: 4,
} as const;

/**
 * The Myanmar map (owner's spec, D101 onwards): amounts in lakh of kyat. Each number belongs to one
 * rule of that map; the World map never reads them.
 */
export const MYANMAR = {
  /** Paid for passing or landing on Start: 750 lakh at the owner's request (spec: 500; D110). */
  startBonus: 750,
  incomeTax: 300,
  /** The Special tax space. */
  luxuryTax: 500,
  /** Transport rent by how many of the four the owner holds. */
  transportRent: [50, 100, 200, 400] as readonly number[],
  /** Company rent: the dice total times this, by how many of the five companies the owner holds (spec v2). */
  companyMultipliers: [25, 50, 100, 200, 400] as readonly number[],
  /** "Go to the nearest airport" card: rent there is multiplied by this. */
  nearestAirportRentFactor: 2,

  // Conscription (spec 7.1, D102)
  /** Paying to avoid service costs this percent of cash... */
  draftPayPercent: 10,
  /** ...and never less than this. */
  draftPayMin: 500,
  draftFleeCost: 800,
  draftHideTurns: 2,
  draftFleeTurns: 1,
  draftServeTurns: 3,
  /** Paid on coming back from service. */
  draftServeBonus: 300,

  // Merit (spec 7.2, D102)
  /** Donated at a pagoda for one merit point. */
  meritDonation: 200,
  meritMax: 3,
  /** The broker card: paid to stay off the conscription list. */
  brokerFee: 500,
  /** The pagoda festival card: donated for one merit point. */
  festivalDonation: 100,
  /** Blackout: city rents are multiplied by this, YESC's by the next. */
  blackoutCityFactor: 0.5,
  blackoutCompanyFactor: 2,

  // Stage 3 (spec 7.4 to 7.10, D104)
  /** City rents rise this many percent... */
  inflationStep: 10,
  /** ...every this many rounds. */
  inflationEvery: 5,
  /** Paid to the owner for passing (not landing on) the Expressway or the Muse gate. */
  toll: 20,
  lotteryTicket: 10,
  /** Lottery: the prize for a dice total of at least `min` (highest first); below the last, nothing. */
  lotteryPrizes: [
    { min: 12, prize: 3000 },
    { min: 10, prize: 500 },
    { min: 7, prize: 100 },
  ] as readonly { min: number; prize: number }[],
  /** Paid each round to a player who fled to the border while they are there. */
  remittance: 200,
  /** The community donation event: every player puts this in the pot. */
  potDonation: 50,

  // Loans (spec 7.11, D105)
  loanMaxRatePercent: 20,
  /** The debt stops growing at this many times the amount lent. */
  loanMaxMultiple: 3,
  /** Passing Start pays back this percent of what is owed, when the cash is there. */
  loanStartRepayPercent: 25,
  loanMaxTerm: 30,

  // Spec v2 (D106, D107)
  /** The porter card: the only way out of the Military camp. */
  porterFee: 500,
  /** Brycen Myanmar's loss: each player pays its owner this. */
  brycenRescue: 100,
  rankMax: 6,
  /** Serving ends with one die: an even number raises the rank by this... */
  rankEven: 2,
  /** ...an odd one by this. */
  rankOdd: 1,
  /** Salary: rank × this, from the bank, on return from serving and each time Start is passed (D109). */
  salaryPerRank: 200,
  /** A player with a rank collects this share of their rent: the army pays them (owner, D109). */
  rankRentFactor: 0.5,
  /** The general has at least this rank. */
  generalMinRank: 4,
  /** From this rank a player may not buy land, and land they leave is not auctioned (owner, D113). */
  noBuyRank: 4,
  /** The general's power can be used once in this many rounds. */
  powerEveryRounds: 2,
  /** Power: a dice total up to this takes money, above it a property. */
  powerMoneyUpTo: 8,
  /** Power money: this share of the richest player's cash, within the two limits (owner, D115). */
  powerMoneyPercent: 10,
  powerMoneyMin: 300,
  powerMoneyMax: 1500,
  /** Merit points the target spends to block one use of power. */
  powerBlockMerit: 2,
  /** Unrest cups each player holds. */
  unrestCups: 2,
  /** Cups shown against one general that bring them down (fewer with two players: D107). */
  unrestToDepose: 3,
} as const;

/** The rules that differ by map. The World map's are spec sections 5 to 9 (and D100). */
export interface MapRules {
  currency: 'usd' | 'kyat';
  startBonus: number;
  incomeTax: number;
  luxuryTax: number;
  /** Airport (transport) rent by how many the owner holds. */
  airportRent: readonly number[];
  /** Company rent multiplier by how many companies the owner holds; null: each company's own. */
  companyMultipliers: readonly number[] | null;
  /** Free Stay tokens are part of the game (a setting on the World map). */
  freeStay: boolean;
  /** Myanmar rules, switched on stage by stage (D101 to D105). */
  conscription: boolean;
  merit: boolean;
  pot: boolean;
  inflation: boolean;
  tolls: boolean;
  lottery: boolean;
  loans: boolean;
  /** Rank, the general and unrest (Myanmar spec v2, D107). */
  general: boolean;
}

export const WORLD_RULES: MapRules = {
  currency: 'usd',
  startBonus: BALANCE.startBonus,
  incomeTax: BALANCE.incomeTax,
  luxuryTax: BALANCE.luxuryTax,
  airportRent: BALANCE.airportRent,
  companyMultipliers: null,
  freeStay: true,
  conscription: false,
  merit: false,
  pot: false,
  inflation: false,
  tolls: false,
  lottery: false,
  loans: false,
  general: false,
};

export const MYANMAR_RULES: MapRules = {
  currency: 'kyat',
  startBonus: MYANMAR.startBonus,
  incomeTax: MYANMAR.incomeTax,
  luxuryTax: MYANMAR.luxuryTax,
  airportRent: MYANMAR.transportRent,
  companyMultipliers: MYANMAR.companyMultipliers,
  freeStay: false,
  conscription: true,
  merit: true,
  pot: true,
  inflation: true,
  tolls: true,
  lottery: true,
  loans: true,
  general: true,
};

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
