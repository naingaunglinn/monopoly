// Engine types. The game state is plain JSON (no undefined, Maps or classes) so a save is a
// straight JSON round trip.
import type { DeckId, ModifierType } from '../data/cardTypes';
import type { TaxKind } from '../data/board';
import type { TokenKind } from '../data/players';

export type { DeckId, ModifierType, TokenKind };

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
export type AnimationSpeed = 'normal' | 'fast' | 'off';
export type Dice = [number, number];

export interface Settings {
  playerCount: number;
  playerNames: string[];
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
  | 'debug';

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
  | { kind: 'debt' };

export type DebtReason =
  | { kind: 'rent'; space: number }
  | { kind: 'tax'; tax: TaxKind }
  | { kind: 'card'; cardId: string }
  | { kind: 'jailFine' };

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
  | { kind: 'passTurn' };

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
  /** A submitted trade offer waiting for the partner's answer. */
  trade: TradeOffer | null;
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
  | { type: 'endTurn' }
  | { type: 'setPassDevice'; on: boolean }
  | { type: 'setAnimationSpeed'; speed: AnimationSpeed }
  | ({ type: 'debug' } & DebugOp);

export type ActionType = Action['type'];

/** legalActions() lists concrete actions, plus a trade template the caller fills in. */
export type LegalAction = Exclude<Action, { type: 'proposeTrade' }> | { type: 'proposeTrade'; offer: null };

// ---------------------------------------------------------------------------------------------
// Events: what just happened, for animation and the log. State is final when they are emitted.

export type GameEvent =
  | { type: 'gameStarted'; firstPlayer: number }
  | { type: 'roundStarted'; round: number }
  | { type: 'turnStarted'; player: number }
  | { type: 'turnSkipped'; player: number }
  | { type: 'turnEnded'; player: number }
  | { type: 'diceRolled'; player: number; dice: Dice; purpose: 'move' | 'jail' | 'company'; doubles: boolean }
  | { type: 'moved'; player: number; from: number; to: number; path: number[]; direction: 1 | -1; by: 'dice' | 'card' }
  | { type: 'teleported'; player: number; from: number; to: number; reason: 'jail' | 'vacation' | 'debug' }
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
  | { type: 'gameOver'; winners: number[]; reason: EndReason }
  | { type: 'settingChanged'; setting: 'passDevice' | 'animationSpeed' }
  | { type: 'debugApplied'; op: DebugOp['op'] };

export type GameEventType = GameEvent['type'];

// ---------------------------------------------------------------------------------------------
// Errors

export type ErrorCode =
  | 'gameOver'
  | 'wrongPhase'
  | 'noticePending'
  | 'tradePending'
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
  | 'invalidAction';

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
