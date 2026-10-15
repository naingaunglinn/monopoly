// Two bots (spec section 15): one picks random legal actions, one plays sensibly. Both choose only
// from legalActions(), so they can never make an illegal move.
import { SIM } from '../data/balance';
import { COUNTRY_CITIES, propertyPrice } from '../data/board';
import {
  buildBlocker,
  collateralValue,
  countryOf,
  draftPayCost,
  loanOfferBlocker,
  pledgedSpaces,
  validateAction,
  type LoanOffer,
  netWorth,
  tradeBlocker,
  type Action,
  type GameState,
  type LegalAction,
  type TradeOffer,
} from '../engine';
import { mulberry32 } from '../engine/rng';

export type BotKind = 'random' | 'sensible';

/** Seeded generator for bot choices, separate from the game's own generator. */
export class BotRandom {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  next(): number {
    const r = mulberry32(this.state);
    this.state = r.next;
    return r.value;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)] as T;
  }
}

const FREE_ACTIONS: ReadonlySet<Action['type']> = new Set(['mortgage', 'unmortgage', 'sellBuilding', 'proposeTrade', 'requestLoan', 'repayLoan', 'offerBribe']);

export function isFreeAction(type: Action['type']): boolean {
  return FREE_ACTIONS.has(type);
}

function concrete(legal: LegalAction[]): Action[] {
  return legal.filter(
    (a) =>
      !(
        ((a.type === 'proposeTrade' || a.type === 'counterTrade' || a.type === 'requestLoan' || a.type === 'counterLoan') &&
          a.offer === null) ||
        (a.type === 'offerBribe' && a.to === null)
      ),
  ) as Action[];
}

/**
 * Myanmar map: a random loan request from `borrower` (to a random lender, or to `lender`), or the
 * same with new terms for a counter-offer. Null when the pick is not a valid loan.
 */
export function randomLoanOffer(s: GameState, borrower: number, rnd: BotRandom, table: LoanOffer | null = null): LoanOffer | null {
  const lenders = s.players.filter((p) => !p.bankrupt && p.id !== borrower && p.cash >= 100 && (table === null || p.id === table.lender));
  if (lenders.length === 0) return null;
  const lender = rnd.pick(lenders);
  const pledged = pledgedSpaces(s);
  const collateral =
    table?.collateral ??
    (() => {
      const options: number[] = [];
      s.properties.forEach((ps, space) => {
        if (ps && ps.owner === borrower && !ps.mortgaged && !pledged.has(space)) options.push(space);
      });
      return options.length > 0 ? [rnd.pick(options)] : [];
    })();
  const offer: LoanOffer = {
    from: table ? table.to : borrower,
    to: table ? table.from : lender.id,
    lender: lender.id,
    borrower,
    amount: 100 + Math.floor(rnd.next() * Math.min(900, lender.cash - 99)),
    ratePercent: Math.floor(rnd.next() * 21),
    term: 1 + Math.floor(rnd.next() * 10),
    collateral,
  };
  return loanOfferBlocker(s, offer) === null ? offer : null;
}

function tradeable(s: GameState, owner: number): number[] {
  const out: number[] = [];
  s.properties.forEach((ps, space) => {
    if (ps && ps.owner === owner) out.push(space);
  });
  return out;
}

/**
 * A small random offer to a random partner (or to `only`, for a counter-offer), or null if the
 * random pick is not a valid trade.
 */
export function randomTradeOffer(s: GameState, actor: number, rnd: BotRandom, only: number | null = null): TradeOffer | null {
  const partners = s.players.filter((p) => !p.bankrupt && p.id !== actor && (only === null || p.id === only));
  if (partners.length === 0) return null;
  const partner = rnd.pick(partners);
  const me = s.players[actor];
  if (!me) return null;
  const mine = tradeable(s, actor);
  const theirs = tradeable(s, partner.id);
  const give = mine.length > 0 && rnd.next() < 0.6 ? [rnd.pick(mine)] : [];
  const get = theirs.length > 0 && rnd.next() < 0.6 ? [rnd.pick(theirs)] : [];
  const giveCash = rnd.next() < 0.4 ? Math.floor(rnd.next() * Math.min(300, me.cash)) : 0;
  const getCash = rnd.next() < 0.4 ? Math.floor(rnd.next() * Math.min(300, partner.cash)) : 0;
  const offer: TradeOffer = {
    from: actor,
    to: partner.id,
    give: { properties: give, cash: giveCash, jailCards: me.jailCards.length > 0 && rnd.next() < 0.3 ? 1 : 0 },
    get: { properties: get, cash: getCash, jailCards: partner.jailCards.length > 0 && rnd.next() < 0.3 ? 1 : 0 },
  };
  return tradeBlocker(s, offer) === null ? offer : null;
}

export interface BotContext {
  state: GameState;
  legal: LegalAction[];
  actor: number;
  rnd: BotRandom;
  /** Free actions this bot already took at the current decision point. */
  freeActionsTaken: number;
}

/** Random bot: a random action type, then a random instance of it. */
export function randomBot(ctx: BotContext): Action {
  const { state, legal, actor, rnd } = ctx;
  const capped = ctx.freeActionsTaken >= SIM.botFreeActionsPerDecision;
  let options = concrete(legal);
  const canTrade = legal.some((a) => a.type === 'proposeTrade');
  if (capped) {
    const progress = options.filter((a) => !isFreeAction(a.type));
    if (progress.length > 0) options = progress;
  }
  const types = [...new Set(options.map((a) => a.type))];
  if (canTrade && !capped) types.push('proposeTrade');
  const canCounter = legal.some((a) => a.type === 'counterTrade') && state.flow.trade !== null;
  if (canCounter) types.push('counterTrade');
  // Myanmar map: loans (D104). Never offered on the World map, so its games are unchanged.
  if (legal.some((a) => a.type === 'requestLoan') && !capped) types.push('requestLoan');
  if (legal.some((a) => a.type === 'counterLoan') && state.flow.loan !== null) types.push('counterLoan');
  // Myanmar map: the general may bribe someone before a use of power (D107).
  if (legal.some((a) => a.type === 'offerBribe') && !capped) types.push('offerBribe');
  const type = rnd.pick(types);
  if (type === 'offerBribe') {
    const to = rnd.pick(state.players.filter((p) => validateAction(state, { type: 'offerBribe', to: p.id, amount: 1 }) === null));
    const me = state.players[actor] as GameState['players'][number];
    const amount = 1 + Math.floor(rnd.next() * Math.min(500, me.cash));
    if (to && validateAction(state, { type: 'offerBribe', to: to.id, amount }) === null) return { type: 'offerBribe', to: to.id, amount };
    const progress = options.filter((a) => !isFreeAction(a.type));
    return rnd.pick(progress.length > 0 ? progress : options);
  }
  if (type === 'counterLoan' && state.flow.loan) {
    const counter = randomLoanOffer(state, state.flow.loan.borrower, rnd, state.flow.loan);
    if (counter) return { type: 'counterLoan', offer: counter };
    return { type: 'respondLoan', accept: false };
  }
  if (type === 'requestLoan' && !options.some((a) => a.type === 'requestLoan')) {
    const offer = randomLoanOffer(state, actor, rnd);
    if (offer) return { type: 'requestLoan', offer };
    const progress = options.filter((a) => !isFreeAction(a.type));
    return rnd.pick(progress.length > 0 ? progress : options);
  }
  if (type === 'counterTrade' && state.flow.trade) {
    const counter = randomTradeOffer(state, actor, rnd, state.flow.trade.from);
    if (counter) return { type: 'counterTrade', offer: counter };
    return { type: 'respondTrade', accept: rnd.next() < 0.5 };
  }
  if (type === 'proposeTrade' && !options.some((a) => a.type === 'proposeTrade')) {
    const offer = randomTradeOffer(state, actor, rnd);
    if (offer) return { type: 'proposeTrade', offer };
    const progress = options.filter((a) => !isFreeAction(a.type));
    return rnd.pick(progress.length > 0 ? progress : options);
  }
  if (type === 'respondTrade') return { type: 'respondTrade', accept: rnd.next() < 0.5 };
  return rnd.pick(options.filter((a) => a.type === type));
}

function find<T extends Action['type']>(legal: LegalAction[], type: T): Extract<Action, { type: T }> | undefined {
  return legal.find((a) => a.type === type) as Extract<Action, { type: T }> | undefined;
}

function cheapest(spaces: number[]): number | undefined {
  return [...spaces].sort((a, b) => propertyPrice(a) - propertyPrice(b) || a - b)[0];
}

/** Value the sensible bot puts on one side of a trade. */
function sideValue(s: GameState, side: TradeOffer['give']): number {
  const props = side.properties.reduce((sum, sp) => sum + propertyPrice(sp) * (s.properties[sp]?.mortgaged ? 0.5 : 1), 0);
  return props + side.cash + side.jailCards * 50;
}

/**
 * Sensible bot: buys while keeping $300, builds when legal, uses Free Stay on rent above $150,
 * pays the Jail fee when cash is above $1,000, mortgages its cheapest property when in debt and
 * unmortgages when cash is above $1,500. It never proposes trades and accepts only clearly good ones.
 */
export function sensibleBot(ctx: BotContext): Action {
  const { state: s, legal, actor } = ctx;
  const me = s.players[actor];
  if (!me) throw new Error('no actor');
  const has = <T extends Action['type']>(type: T) => find(legal, type);

  const ack = has('acknowledge');
  if (ack) return ack;

  // Myanmar map: a loan on the table (D104). A lender wants 5% a round and collateral worth the
  // amount; a borrower takes up to 10%.
  if (s.flow.loan && s.flow.loan.to === actor) {
    const offer = s.flow.loan;
    const canAccept = legal.some((a) => a.type === 'respondLoan' && a.accept);
    const good =
      offer.lender === actor
        ? offer.ratePercent >= 5 && collateralValue(offer.collateral) >= offer.amount && me.cash - offer.amount >= SIM.sensibleKeepCash
        : offer.ratePercent <= 10;
    return { type: 'respondLoan', accept: canAccept && good };
  }

  // Myanmar map: the general's power and the unrest window (D107).
  const pending = s.flow.pending;
  if (pending?.kind === 'bribe') return { type: 'respondBribe', accept: pending.amount >= SIM.sensibleBribeAbove };
  if (pending?.kind === 'unrest') {
    const answers = legal.filter((a): a is Extract<Action, { type: 'unrestAnswer' }> => a.type === 'unrestAnswer' && a.player === actor);
    // The target blocks with merit if it can, else shows unrest; the others are glad to hold back.
    const pick = actor === pending.target ? (answers.find((a) => a.block) ?? answers.find((a) => a.use)) : undefined;
    return pick ?? answers.find((a) => !a.use && !a.block) ?? (concrete(legal)[0] as Action);
  }
  if (pending?.kind === 'powerTarget') {
    const options = legal.filter((a): a is Extract<Action, { type: 'powerTarget' }> => a.type === 'powerTarget');
    // Money from the richest, or the most valuable property.
    const best = [...options].sort((a, b) =>
      a.space === null || b.space === null
        ? (s.players[b.player]?.cash ?? 0) - (s.players[a.player]?.cash ?? 0)
        : propertyPrice(b.space) - propertyPrice(a.space),
    )[0];
    return best ?? (concrete(legal)[0] as Action);
  }
  const power = has('usePower');
  if (power) return power;

  if (s.flow.trade && s.flow.trade.to === actor) {
    const offer = s.flow.trade;
    const gain = sideValue(s, offer.give);
    const loss = sideValue(s, offer.get);
    return { type: 'respondTrade', accept: gain >= loss * 1.25 && gain > 0 };
  }

  // Myanmar map: pay a loan back when the cash is plentiful.
  const repay = () => {
    const option = has('repayLoan');
    return option && me.cash - option.amount > SIM.sensibleUnmortgageAbove ? option : undefined;
  };
  const unmortgage = () => {
    if (me.cash <= SIM.sensibleUnmortgageAbove) return undefined;
    const options = legal.filter((a): a is Extract<Action, { type: 'unmortgage' }> => a.type === 'unmortgage');
    const space = cheapest(options.map((a) => a.space));
    return space === undefined ? undefined : ({ type: 'unmortgage', space } as const);
  };
  // Building covers every city of the country landed in (D98).
  const buildAvailable = () => {
    const landed = s.turn.landedCity;
    if (!has('openBuild') || landed === null) return false;
    const country = countryOf(landed);
    return country !== null && COUNTRY_CITIES[country].some((sp) => buildBlocker(s, actor, sp) === null);
  };

  switch (s.flow.phase) {
    case 'PassDevice':
      return { type: 'ready' };
    case 'TurnStart':
      // Myanmar map, called up (D102): a merit point, the exemption card, paying if cash allows, else hiding.
      if (s.flow.pending?.kind === 'draftChoice') {
        const choose = (how: string) => legal.find((a) => a.type === 'draftChoose' && a.how === how) as Action | undefined;
        const pay = choose('pay');
        const payCost = pay ? draftPayCost(me.cash) : Infinity;
        return (
          choose('merit') ??
          choose('card') ??
          (me.cash - payCost >= SIM.sensibleJailFeeAbove ? pay : undefined) ??
          // Spec v2: serving earns rank and a salary, so it beats hiding (D107).
          choose('serve') ??
          choose('hide') ??
          (concrete(legal)[0] as Action)
        );
      }
      return (
        has('useJailCard') ??
        (me.cash > SIM.sensibleJailFeeAbove ? has('payJailFine') : undefined) ??
        has('rollForDoubles') ??
        (concrete(legal)[0] as Action)
      );
    case 'AwaitRoll':
      return repay() ?? unmortgage() ?? (buildAvailable() ? { type: 'openBuild' } : { type: 'roll' });
    case 'BuyDecision': {
      if (s.flow.pending?.kind === 'donation') {
        return me.cash > SIM.sensibleUnmortgageAbove && has('donate') && legal.some((a) => a.type === 'donate' && a.give)
          ? { type: 'donate', give: true }
          : { type: 'donate', give: false };
      }
      const space = s.flow.pending?.kind === 'buy' ? s.flow.pending.space : -1;
      const buy = has('buy');
      return buy && me.cash - propertyPrice(space) >= SIM.sensibleKeepCash ? buy : { type: 'decline' };
    }
    case 'Auction': {
      if (s.flow.pending?.kind !== 'auction') return { type: 'fold' };
      const auction = s.flow.pending.auction;
      // Bid up to the printed price while keeping $300: raise by $10, or the minimum near the limit.
      const limit = Math.min(propertyPrice(auction.space), me.cash - SIM.sensibleKeepCash);
      const bids = legal.filter((a): a is Extract<Action, { type: 'bid' }> => a.type === 'bid' && a.amount <= limit);
      return bids.find((b) => b.amount === auction.highBid + 10) ?? bids[0] ?? { type: 'fold' };
    }
    case 'RentDue': {
      const rent = s.flow.pending?.kind === 'rent' ? s.flow.pending.rent : null;
      const freeStay = has('useFreeStay');
      if (freeStay && rent && rent.amount > SIM.sensibleFreeStayAbove) return freeStay;
      // Myanmar map: a merit point on a big rent.
      const merit = has('useMerit');
      return merit && rent && rent.amount >= SIM.sensibleMeritRentAbove ? merit : { type: 'payRent' };
    }
    case 'CompanyRoll':
      return { type: 'rollCompanyDice' };
    case 'CardReveal': {
      // Myanmar map: cancel a bad card with spare merit; pay the broker when cash allows.
      const merit = has('useMerit');
      if (merit && me.merit >= 2) return merit;
      const broker = has('brokerPay');
      if (broker && me.cash > SIM.sensibleJailFeeAbove) return broker;
      const ticket = has('buyTicket');
      if (ticket && me.cash > SIM.sensibleJailFeeAbove) return ticket;
      return { type: 'confirmCard' };
    }
    case 'BuildOffer':
      return has('build') ?? { type: 'finishBuilding' };
    case 'Debt': {
      const pay = has('payDebt');
      if (pay) return pay;
      const mortgages = legal.filter((a): a is Extract<Action, { type: 'mortgage' }> => a.type === 'mortgage');
      const space = cheapest(mortgages.map((a) => a.space));
      if (space !== undefined) return { type: 'mortgage', space };
      const sell = has('sellBuilding');
      return sell ?? { type: 'declareBankruptcy' };
    }
    case 'AwaitEndTurn':
      return repay() ?? unmortgage() ?? (buildAvailable() ? { type: 'openBuild' } : { type: 'endTurn' });
    case 'GameOver':
      throw new Error('no move after game over');
  }
}

export function chooseAction(kind: BotKind, ctx: BotContext): Action {
  return kind === 'random' ? randomBot(ctx) : sensibleBot(ctx);
}

/** Net worth helper re-exported for reports. */
export { netWorth };
