// Engine types. The game state is plain JSON (no undefined, Maps or classes) so a save is a
// straight JSON round trip.
import type { BoardShape } from '../data/balance.js';
import type { DeckId, ModifierType } from '../data/cardTypes.js';
import type { CountryId } from '../data/countries.js';
import type { MapId, TaxKind } from '../data/board.js';
import type { TokenKind } from '../data/players.js';

export type { DeckId, MapId, ModifierType, TokenKind };

/** The phase state machine has exactly these values (spec section 9). */
export const PHASES = [
  'PassDevice',
  'TurnStart',
  'AwaitRoll',
  'BuyDecision',
  'Auction',
  'RentDue',
  'CompanyRoll',
  'CardReveal',
  'BuildOffer',
  'Debt',
  'AwaitEndTurn',
  'GameOver',
] as const;
export type Phase = (typeof PHASES)[number];

export type GameMode = 'quick' | 'normal';

/** The board a game is played on: BOARD_SIZE and BOARD_SHAPE when it was created (D96). */
export interface BoardSettings {
  spaces: number;
  shape: BoardShape;
}
export type AnimationSpeed = 'normal' | 'fast' | 'off';
export type Dice = [number, number];

export interface Settings {
  playerCount: number;
  playerNames: string[];
  /** One colour per seat (always 6, all different), from PLAYER_COLORS. */
  playerColors: string[];
  startingMoney: number;
  mode: GameMode;
  /** Quick mode only. */
  roundLimit: number;
  freeStay: boolean;
  vacation: boolean;
  auction: boolean;
  chance: boolean;
  event: boolean;
  randomFirstPlayer: boolean;
  passDevice: boolean;
  animationSpeed: AnimationSpeed;
  /** Always the board of the map: the code sets it, never a player. */
  board: BoardSettings;
  /** The map: the World board, or the Myanmar map (D101). */
  map: MapId;
  /** Myanmar map: the general, the power, unrest and bribes (house rule, D115). Rank stays either way. */
  general: boolean;
}

export type MoneyReason =
  | 'start'
  | 'buy'
  | 'auction'
  | 'rent'
  | 'tax'
  | 'card'
  | 'freeStayCash'
  | 'build'
  | 'sell'
  | 'mortgage'
  | 'unmortgage'
  | 'jailFine'
  | 'trade'
  | 'bankruptcy'
  | 'debug'
  /** Myanmar map: paying or fleeing military service, and the bonus for serving (D102). */
  | 'draft'
  /** Myanmar map: a donation for merit (D102). */
  | 'merit'
  /** Myanmar map (D103): tolls, the community pot, money sent home from the border, the lottery. */
  | 'toll'
  | 'pot'
  | 'remittance'
  | 'lottery'
  /** Myanmar map: a loan paid out or paid back (D104). */
  | 'loan'
  /** Myanmar map (D107): pay on return from the army, the general's power, a bribe. */
  | 'salary'
  | 'power'
  | 'bribe';

/** Something that changed a player's cash while it was not their turn (shown at turn start). */
export interface RecapItem {
  delta: number;
  reason: MoneyReason;
  /** The other player involved, if any. */
  counterparty: number | null;
  space: number | null;
  cardId: string | null;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  token: TokenKind;
  cash: number;
  position: number;
  freeStay: number;
  inJail: boolean;
  /** Failed doubles rolls during the current stay in Jail. */
  jailAttempts: number;
  skipNextTurn: boolean;
  /** Held Get Out of Jail card ids. */
  jailCards: string[];
  /** Held Free House card ids. */
  houseVouchers: string[];
  bankrupt: boolean;
  /** Order of elimination (1 = first out), for ranking. */
  bankruptOrder: number | null;
  recap: RecapItem[];
  /** Myanmar map: merit points from pagoda donations, 0 to 3 (D102). Always 0 on the World map. */
  merit: number;
  /** Myanmar map: military service in progress (D102). Always null on the World map. */
  draft: Draft | null;
  /** Myanmar map: military rank 0 to 6, from serving (spec v2, D107). Always 0 on the World map. */
  rank: number;
  /** When the rank last rose (economy.rankSeq then): of two equal ranks, the earlier one leads. */
  rankAt: number;
  /** Myanmar map: unrest cups left to show against the general (spec v2, D107). */
  unrest: number;
}

/** How a player called up for military service chose to go through it (spec 7.1). */
/** 'called': sent to the Military camp by the Porters news on someone else's turn; chooses at their next turn (D106). */
export type DraftStatus = 'hiding' | 'serving' | 'fled' | 'called';

export interface Draft {
  status: DraftStatus;
  /** Turns still to skip. */
  turns: number;
}

/** A loan between two players (spec 7.11, D105). */
export interface Loan {
  id: number;
  lender: number;
  borrower: number;
  /** The amount lent. */
  principal: number;
  /** Simple interest per round, in percent of the amount lent. */
  ratePercent: number;
  /** Rounds until it must be paid back. */
  term: number;
  /** The round it was made in. */
  startRound: number;
  /** Properties pledged: they go to the lender if it is not paid back in time. */
  collateral: number[];
  /** Paid back so far. */
  repaid: number;
}

/** A loan asked for or offered, waiting for the other player's answer, like a trade offer. */
export interface LoanOffer {
  /** Who made this offer, and who answers it. */
  from: number;
  to: number;
  lender: number;
  borrower: number;
  amount: number;
  ratePercent: number;
  term: number;
  collateral: number[];
}

/** Money that belongs to no player: the Myanmar map's community pot, inflation and loans. */
export interface Economy {
  /** Taxes and fines, waiting for the next player to reach the Refuge (D104). */
  pot: number;
  /** City rents are this many percent higher (D103). */
  inflation: number;
  loans: Loan[];
  /** Id of the next loan. */
  loanSeq: number;
  /** Myanmar map (spec v2, D107): the general (highest rank, 4 or more), or nobody. */
  general: number | null;
  /** The round the general last used their power; null: not since they became general. */
  powerRound: number | null;
  /** Unrest cups shown against the current general. */
  unrestUsed: number;
  /** Players paid by the general not to show unrest at the next use of power. */
  bribed: number[];
  /** Counts rank rises, to order equal ranks. */
  rankSeq: number;
}

export interface PropertyState {
  owner: number | null;
  /** 0–4 houses, 5 = hotel. Always 0 for airports and companies. */
  level: number;
  mortgaged: boolean;
}

export interface Decks {
  chanceDeck: string[];
  chanceDiscard: string[];
  eventDeck: string[];
  eventDiscard: string[];
}

export interface TurnState {
  currentPlayerIndex: number;
  doublesCount: number;
  /** The city the current player landed on this move; building is allowed only there (5.8). */
  landedCity: number | null;
  turnNumber: number;
  roundNumber: number;
  /** Seat that opens every round: the first player, or the next living seat after it. */
  roundStartSeat: number;
  /** Movement rolls still available this turn (doubles and Roll again cards add one). */
  rollsLeft: number;
  /** The last movement or Jail roll of this turn. */
  dice: Dice | null;
  /** What happened to the current player since their previous turn. */
  recap: RecapItem[];
}

export interface AuctionState {
  space: number;
  /** Bidding order: clockwise from the player after the lander; the lander bids last. */
  order: number[];
  /** Bidders who have not folded, in bidding order. */
  active: number[];
  /** Player whose turn it is to bid. */
  current: number;
  highBid: number;
  highBidder: number | null;
}

export type RentCalc =
  | { kind: 'cityBase'; baseRent: number; factor: number | null }
  | { kind: 'cityComplete'; baseRent: number; level: number; multiplier: number; factor: number | null }
  | { kind: 'airport'; owned: number; ladderRent: number; factor: number | null }
  | { kind: 'company'; dice: Dice; total: number; multiplier: number; factor: number | null }
  | { kind: 'tax'; tax: TaxKind };

export interface RentDue {
  space: number;
  payer: number;
  /** null = the bank (taxes). */
  creditor: number | null;
  amount: number;
  calc: RentCalc;
  freeStayAllowed: boolean;
}

export type Pending =
  | { kind: 'jailChoice' }
  | { kind: 'vacationSkip' }
  | { kind: 'buy'; space: number }
  | { kind: 'auction'; auction: AuctionState }
  | { kind: 'rent'; rent: RentDue }
  | { kind: 'companyRoll'; space: number; owner: number }
  | { kind: 'card'; deck: DeckId; cardId: string }
  | { kind: 'build'; space: number }
  | { kind: 'debt' }
  /** Myanmar map: just called up, the player chooses how to deal with military service (D102). */
  | { kind: 'draftChoice' }
  /** Myanmar map: a turn spent hiding, serving or at the border is skipped (D102). */
  | { kind: 'draftSkip' }
  /** Myanmar map: landed on a pagoda, the player may donate for merit (D102). */
  | { kind: 'donation'; space: number }
  /** Myanmar map (spec v2, D107): the general's power came up money or land; the general picks the target. */
  | { kind: 'powerTarget'; outcome: PowerOutcome; dice: Dice }
  /**
   * The unrest window after a use of power: `waiting` answer in any order (seat order for the
   * decision maker); `used` showed a cup; `blocked`: the target spent merit to stop it.
   */
  | { kind: 'unrest'; outcome: PowerOutcome; target: number; space: number | null; waiting: number[]; used: number[]; blocked: boolean }
  /** The general offers `to` money not to show unrest at the next use of power. */
  | { kind: 'bribe'; to: number; amount: number };

/** The general's power (spec v2): money from a player, or one of their properties. */
export type PowerOutcome = 'money' | 'land';

/** The five ways out of military service, and the Call-up exemption card (spec 7.1, D102). */
export type DraftChoice = 'pay' | 'hide' | 'flee' | 'serve' | 'merit' | 'card';

export type DebtReason =
  | { kind: 'rent'; space: number }
  | { kind: 'tax'; tax: TaxKind }
  | { kind: 'card'; cardId: string }
  | { kind: 'jailFine' }
  /** Myanmar map: passing a toll road or gate (D103). */
  | { kind: 'toll'; space: number }
  /** Myanmar map: the money the general's power takes (D107). */
  | { kind: 'power' };

export interface DebtItem {
  debtor: number;
  /** null = the bank. */
  creditor: number | null;
  amount: number;
  reason: DebtReason;
}

/** What happens once every queued debt is settled. */
export type Resume =
  | { kind: 'afterResolution' }
  | { kind: 'jailMove'; total: number }
  | { kind: 'passTurn' }
  /** Myanmar map: tolls paid on the way, the landing is resolved now (D103). */
  | { kind: 'landing'; rentFactor: number | null };

export type Notice =
  | { kind: 'vacation'; player: number }
  | { kind: 'bankruptcy'; player: number; creditor: number | null };

export interface TradeSide {
  properties: number[];
  cash: number;
  jailCards: number;
}

export interface TradeOffer {
  from: number;
  to: number;
  /** What `from` gives. */
  give: TradeSide;
  /** What `from` gets. */
  get: TradeSide;
}

export interface ActiveModifier {
  type: ModifierType;
  factor: number;
  cardId: string;
  drawnBy: number;
}

export interface FlowState {
  phase: Phase;
  pending: Pending | null;
  /**
   * The offer on the table, waiting for `to` to accept, reject or counter (spec 7.2, D99). Everyone
   * sees it; the game waits until it is answered or withdrawn.
   */
  trade: TradeOffer | null;
  /** Myanmar map: a loan asked for or offered, on the table like a trade (D105). */
  loan: LoanOffer | null;
  /** Acknowledgement overlays (vacation, bankruptcy). They block other actions until OK. */
  notices: Notice[];
  /** Payments waiting to be made, in order. The head is the one being settled. */
  debts: DebtItem[];
  resume: Resume | null;
  modifiers: ActiveModifier[];
}

export type EndReason = 'roundLimit' | 'bankruptcy' | 'lastPlayer';

export interface LogEntry {
  seq: number;
  turn: number;
  round: number;
  event: GameEvent;
}

export interface GameStats {
  housesBuilt: number;
  hotelsBuilt: number;
  bankruptcies: number;
}

export interface MetaState {
  schemaVersion: number;
  settings: Settings;
  seed: number;
  rngState: number;
  /** Winning player ids; more than one means a shared win. */
  winner: number[] | null;
  endReason: EndReason | null;
  log: LogEntry[];
  logSeq: number;
  /** Debug: dice to use for the next rolls. */
  forcedDice: Dice[];
  /** Debug: card to draw next from each deck. */
  forcedCards: { chance: string | null; event: string | null };
  stats: GameStats;
}

export interface GameState {
  players: Player[];
  /** Indexed by board space; null for non-property spaces. */
  properties: (PropertyState | null)[];
  decks: Decks;
  turn: TurnState;
  flow: FlowState;
  meta: MetaState;
  economy: Economy;
}

// ---------------------------------------------------------------------------------------------
// Actions

export type DebugOp =
  | { op: 'setNextDice'; dice: Dice }
  | { op: 'movePlayer'; player: number; space: number }
  | { op: 'cash'; player: number; delta: number }
  | { op: 'setOwner'; space: number; owner: number | null }
  | { op: 'setLevel'; space: number; level: number }
  | { op: 'setMortgaged'; space: number; mortgaged: boolean }
  | { op: 'forceCard'; deck: DeckId; cardId: string };

export type Action =
  | { type: 'ready' }
  | { type: 'acknowledge' }
  | { type: 'payJailFine' }
  | { type: 'useJailCard' }
  | { type: 'rollForDoubles' }
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'bid'; amount: number }
  | { type: 'fold' }
  | { type: 'payRent' }
  | { type: 'useFreeStay' }
  | { type: 'rollCompanyDice' }
  | { type: 'confirmCard' }
  | { type: 'openBuild' }
  | { type: 'build'; space: number }
  | { type: 'finishBuilding' }
  | { type: 'sellBuilding'; space: number }
  | { type: 'mortgage'; space: number }
  | { type: 'unmortgage'; space: number }
  | { type: 'payDebt' }
  | { type: 'declareBankruptcy' }
  | { type: 'proposeTrade'; offer: TradeOffer }
  | { type: 'respondTrade'; accept: boolean }
  /** The partner answers with a new offer back: `offer.from` is the old `to` (D99). */
  | { type: 'counterTrade'; offer: TradeOffer }
  /** The player who made the offer on the table takes it back (D99). */
  | { type: 'withdrawTrade' }
  /** Myanmar map (D102): the choice on being called up. */
  | { type: 'draftChoose'; how: DraftChoice }
  /** Myanmar map: leave military service now, at the start of a skipped turn. */
  | { type: 'leaveDraft'; how: 'merit' | 'card' }
  /** Myanmar map: donate at a pagoda for a merit point, or not. */
  | { type: 'donate'; give: boolean }
  /** Myanmar map: spend a merit point to skip this rent or cancel this bad Chance card. */
  | { type: 'useMerit' }
  /** Myanmar map: buy the lottery ticket on the card (D103). */
  | { type: 'buyTicket' }
  /** Myanmar map (D104): ask another player for a loan (`offer.from` is the borrower). */
  | { type: 'requestLoan'; offer: LoanOffer }
  /** The answer to the loan offer on the table, with new terms back the other way. */
  | { type: 'counterLoan'; offer: LoanOffer }
  | { type: 'respondLoan'; accept: boolean }
  /** The player who made the loan offer on the table takes it back. */
  | { type: 'withdrawLoan' }
  /** The borrower pays back part or all of a loan on their own turn. */
  | { type: 'repayLoan'; loanId: number; amount: number }
  /** Myanmar map (spec v2, D107): the general rolls for their power. */
  | { type: 'usePower' }
  /** The general picks who the power hits (and, for land, which property). */
  | { type: 'powerTarget'; player: number; space: number | null }
  /** A player's answer in the unrest window: show a cup, or (the target) block with merit, or hold. */
  | { type: 'unrestAnswer'; player: number; use: boolean; block: boolean }
  /** The general offers a player money not to show unrest at the next use of power. */
  | { type: 'offerBribe'; to: number; amount: number }
  | { type: 'respondBribe'; accept: boolean }
  /** Myanmar map: pay the broker on the card instead of going to the Military camp. */
  | { type: 'brokerPay' }
  | { type: 'endTurn' }
  | { type: 'setPassDevice'; on: boolean }
  | { type: 'setAnimationSpeed'; speed: AnimationSpeed }
  /** Online host control: the player leaves the game, bankrupt to the bank (DECISIONS D60). */
  | { type: 'removePlayer'; player: number }
  | ({ type: 'debug' } & DebugOp);

export type ActionType = Action['type'];

/** legalActions() lists concrete actions, plus trade templates the caller fills in. */
export type LegalAction =
  | Exclude<Action, { type: 'proposeTrade' } | { type: 'counterTrade' } | { type: 'requestLoan' } | { type: 'counterLoan' } | { type: 'offerBribe' }>
  | { type: 'proposeTrade'; offer: null }
  | { type: 'counterTrade'; offer: null }
  | { type: 'requestLoan'; offer: null }
  | { type: 'counterLoan'; offer: null }
  | { type: 'offerBribe'; to: null; amount: null };

// ---------------------------------------------------------------------------------------------
// Events: what just happened, for animation and the log. State is final when they are emitted.

export type GameEvent =
  | { type: 'gameStarted'; firstPlayer: number }
  | { type: 'roundStarted'; round: number }
  | { type: 'turnStarted'; player: number }
  | { type: 'turnSkipped'; player: number }
  | { type: 'turnEnded'; player: number }
  | { type: 'diceRolled'; player: number; dice: Dice; purpose: 'move' | 'jail' | 'company' | 'lottery' | 'power'; doubles: boolean }
  | { type: 'moved'; player: number; from: number; to: number; path: number[]; direction: 1 | -1; by: 'dice' | 'card' }
  | { type: 'teleported'; player: number; from: number; to: number; reason: 'jail' | 'vacation' | 'flee' | 'debug' }
  | { type: 'passedStart'; player: number; amount: number }
  | { type: 'landed'; player: number; space: number }
  | { type: 'money'; player: number; delta: number; reason: MoneyReason; counterparty: number | null }
  | { type: 'bought'; player: number; space: number; price: number }
  | { type: 'declined'; player: number; space: number }
  | { type: 'auctionStarted'; space: number; lander: number }
  | { type: 'bid'; player: number; amount: number }
  | { type: 'folded'; player: number; auto: boolean }
  | { type: 'auctionWon'; player: number; space: number; price: number }
  | { type: 'auctionUnsold'; space: number }
  | { type: 'rentPaid'; from: number; to: number; space: number; amount: number }
  | { type: 'freeStayUsed'; player: number; space: number; owner: number; saved: number; left: number }
  | { type: 'noRent'; player: number; space: number; owner: number }
  | { type: 'feePaid'; player: number; amount: number; reason: 'incomeTax' | 'luxuryTax' | 'jailFine' }
  | { type: 'cardDrawn'; player: number; deck: DeckId; cardId: string }
  | { type: 'deckShuffled'; deck: DeckId }
  | { type: 'cardCash'; player: number; amount: number; cardId: string }
  | { type: 'cardTransfer'; from: number; to: number; amount: number; cardId: string }
  | { type: 'cardNoEffect'; player: number; cardId: string }
  | { type: 'freeStayGained'; player: number; tokens: number }
  | { type: 'cardKept'; player: number; cardId: string }
  | { type: 'rollAgainGranted'; player: number }
  | { type: 'modifierStarted'; modifier: ActiveModifier }
  | { type: 'modifierEnded'; modifier: ActiveModifier }
  | { type: 'built'; player: number; space: number; level: number; cost: number; voucher: boolean }
  | { type: 'buildingSold'; player: number; space: number; level: number; refund: number }
  | { type: 'mortgaged'; player: number; space: number; amount: number }
  | { type: 'unmortgaged'; player: number; space: number; cost: number }
  | { type: 'jailed'; player: number; reason: 'space' | 'card' | 'doubles' }
  | { type: 'jailRollFailed'; player: number; attempts: number }
  | { type: 'leftJail'; player: number; how: 'fine' | 'card' | 'doubles' | 'forcedFine' }
  | { type: 'vacationStarted'; player: number }
  | { type: 'debtStarted'; debtor: number; creditor: number | null; amount: number; shortfall: number }
  | { type: 'debtPaid'; debtor: number; creditor: number | null; amount: number }
  | { type: 'bankrupt'; player: number; creditor: number | null; cash: number; properties: number }
  | { type: 'tradeProposed'; from: number; to: number }
  | { type: 'tradeAccepted'; offer: TradeOffer }
  | { type: 'tradeRejected'; from: number; to: number }
  /** `from` answered with a counter-offer to `to` (the new offer on the table). */
  | { type: 'tradeCountered'; from: number; to: number }
  /** `from` took back their offer to `to`. */
  | { type: 'tradeWithdrawn'; from: number; to: number }
  | { type: 'tradeCancelled'; from: number; to: number }
  | { type: 'playerRemoved'; player: number }
  | { type: 'gameOver'; winners: number[]; reason: EndReason }
  | { type: 'settingChanged'; setting: 'passDevice' | 'animationSpeed' }
  // Myanmar map (D102)
  | { type: 'draftChosen'; player: number; how: DraftChoice; cost: number }
  | { type: 'draftEnded'; player: number; how: 'done' | 'merit' | 'card'; bonus: number }
  | { type: 'meritGained'; player: number; merit: number }
  /** Rent not collected: the owner is in military service, or the payer spent a merit point. */
  | { type: 'rentWaived'; player: number; space: number; owner: number; amount: number; why: 'draft' | 'merit' }
  | { type: 'cardCancelled'; player: number; cardId: string }
  /** Fuel shortage: these players skip their next turn. */
  | { type: 'fuelShortage'; players: number[]; cardId: string }
  | { type: 'inflationRose'; rate: number; by: 'round' | 'card' }
  // Myanmar map (D103)
  | { type: 'tollPaid'; from: number; to: number; space: number; amount: number }
  | { type: 'potAdded'; player: number; amount: number; pot: number }
  | { type: 'potTaken'; player: number; amount: number }
  | { type: 'remittance'; player: number; amount: number }
  | { type: 'lotteryDrawn'; player: number; dice: Dice; total: number; prize: number }
  | { type: 'earthquake'; die: number; region: CountryId; spaces: number[] }
  // Myanmar map: loans (D104)
  | { type: 'loanRequested'; from: number; to: number }
  | { type: 'loanCountered'; from: number; to: number }
  | { type: 'loanRejected'; from: number; to: number }
  | { type: 'loanWithdrawn'; from: number; to: number }
  | { type: 'loanCancelled'; from: number; to: number }
  | { type: 'loanAccepted'; loan: Loan }
  | { type: 'loanRepaid'; loanId: number; borrower: number; lender: number; amount: number; left: number; auto: boolean }
  /** The end of a loan's term: `paid` of the `owed` debt came from the borrower's cash (D108). */
  | { type: 'loanDue'; loanId: number; borrower: number; lender: number; owed: number; paid: number; left: number }
  /** Unpaid at the end of its term, or the borrower went bankrupt: the collateral goes to the lender. */
  | { type: 'loanDefaulted'; loanId: number; borrower: number; lender: number; collateral: number[]; why: 'term' | 'bankruptcy' }
  /** The lender went bankrupt: the loan is cancelled and its collateral freed. */
  | { type: 'loanForgiven'; loanId: number; borrower: number; lender: number }
  // Myanmar map: rank, the general and unrest (spec v2, D107)
  | { type: 'promoted'; player: number; die: number; rank: number; salary: number }
  /** Myanmar map: rank 4 or more may not buy land; it stays for sale, with no auction (owner, D113). */
  | { type: 'buyBarred'; player: number; space: number; rank: number }
  /** A player with a rank draws their salary on passing Start (D109). */
  | { type: 'salaryPaid'; player: number; amount: number }
  | { type: 'generalChanged'; player: number | null; previous: number | null }
  | { type: 'powerRolled'; player: number; dice: Dice; outcome: PowerOutcome }
  | { type: 'powerFizzled'; player: number }
  | { type: 'powerTargeted'; player: number; target: number; space: number | null; outcome: PowerOutcome }
  | { type: 'unrestAnswered'; player: number; use: boolean; block: boolean }
  | { type: 'generalDeposed'; player: number; used: number }
  | { type: 'powerBlocked'; player: number; target: number }
  | { type: 'powerSeized'; from: number; to: number; space: number }
  | { type: 'powerPaid'; from: number; to: number; amount: number }
  | { type: 'bribeOffered'; from: number; to: number; amount: number }
  | { type: 'bribeAnswered'; from: number; to: number; amount: number; accept: boolean }
  | { type: 'debugApplied'; op: DebugOp['op'] };

export type GameEventType = GameEvent['type'];

// ---------------------------------------------------------------------------------------------
// Errors

export type ErrorCode =
  | 'gameOver'
  | 'wrongPhase'
  | 'noticePending'
  | 'tradePending'
  | 'tradeWait'
  | 'notEnoughCash'
  | 'notProperty'
  | 'notOwner'
  | 'notCity'
  | 'alreadyMortgaged'
  | 'notMortgaged'
  | 'countryHasBuildings'
  | 'countryIncomplete'
  | 'countryMortgaged'
  | 'notLandedHere'
  | 'evenBuild'
  | 'hasHotel'
  | 'noBuildings'
  | 'evenSell'
  | 'noJailCard'
  | 'bidTooLow'
  | 'bidTooHigh'
  | 'invalidAmount'
  | 'freeStayUnavailable'
  | 'debtNotCovered'
  | 'tradeInvalidPlayer'
  | 'tradeEmpty'
  | 'tradeNotOwned'
  | 'tradeBuildings'
  | 'tradeCash'
  | 'tradeCards'
  | 'noUnmortgageInDebt'
  | 'invalidAction'
  /** Myanmar map (D102). */
  | 'noMerit'
  | 'meritFull'
  | 'tradeBlocked'
  /** Myanmar map: loans (D104). */
  | 'loanPending'
  | 'loanTerms'
  | 'loanCollateral'
  | 'pledged'
  | 'loanRepay'
  /** Myanmar map (D107). */
  | 'powerNotReady'
  | 'powerTarget'
  | 'unrestNone'
  | 'meritShort'
  /** Myanmar map: rank 4 or more may not buy land (owner, D113). */
  | 'rankNoBuy';

export type ErrorParams = Record<string, string | number>;

export interface EngineError {
  code: ErrorCode;
  params: ErrorParams;
  /** Plain-language reason for the UI (from ui/strings.ts). */
  reason: string;
}

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
  error: EngineError | null;
}
