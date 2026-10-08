// Two bots (spec section 15): one picks random legal actions, one plays sensibly. Both choose only
// from legalActions(), so they can never make an illegal move.
import { SIM } from '../data/balance';
import { propertyPrice } from '../data/board';
import {
  buildBlocker,
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

const FREE_ACTIONS: ReadonlySet<Action['type']> = new Set(['mortgage', 'unmortgage', 'sellBuilding', 'proposeTrade']);

export function isFreeAction(type: Action['type']): boolean {
  return FREE_ACTIONS.has(type);
}

function concrete(legal: LegalAction[]): Action[] {
  return legal.filter((a) => !(a.type === 'proposeTrade' && a.offer === null)) as Action[];
}

function tradeable(s: GameState, owner: number): number[] {
  const out: number[] = [];
  s.properties.forEach((ps, space) => {
    if (ps && ps.owner === owner) out.push(space);
  });
  return out;
}

/** A small random offer to a random partner, or null if the random pick is not a valid trade. */
export function randomTradeOffer(s: GameState, actor: number, rnd: BotRandom): TradeOffer | null {
  const partners = s.players.filter((p) => !p.bankrupt && p.id !== actor);
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
  const type = rnd.pick(types);
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

  if (s.flow.trade && s.flow.trade.to === actor) {
    const offer = s.flow.trade;
    const gain = sideValue(s, offer.give);
    const loss = sideValue(s, offer.get);
    return { type: 'respondTrade', accept: gain >= loss * 1.25 && gain > 0 };
  }

  const unmortgage = () => {
    if (me.cash <= SIM.sensibleUnmortgageAbove) return undefined;
    const options = legal.filter((a): a is Extract<Action, { type: 'unmortgage' }> => a.type === 'unmortgage');
    const space = cheapest(options.map((a) => a.space));
    return space === undefined ? undefined : ({ type: 'unmortgage', space } as const);
  };
  const buildAvailable = () =>
    has('openBuild') && s.turn.landedCity !== null && buildBlocker(s, actor, s.turn.landedCity) === null;

  switch (s.flow.phase) {
    case 'PassDevice':
      return { type: 'ready' };
    case 'TurnStart':
      return (
        has('useJailCard') ??
        (me.cash > SIM.sensibleJailFeeAbove ? has('payJailFine') : undefined) ??
        has('rollForDoubles') ??
        (concrete(legal)[0] as Action)
      );
    case 'AwaitRoll':
      return unmortgage() ?? (buildAvailable() ? { type: 'openBuild' } : { type: 'roll' });
    case 'BuyDecision': {
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
      return freeStay && rent && rent.amount > SIM.sensibleFreeStayAbove ? freeStay : { type: 'payRent' };
    }
    case 'CompanyRoll':
      return { type: 'rollCompanyDice' };
    case 'CardReveal':
      return { type: 'confirmCard' };
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
      return unmortgage() ?? (buildAvailable() ? { type: 'openBuild' } : { type: 'endTurn' });
    case 'GameOver':
      throw new Error('no move after game over');
  }
}

export function chooseAction(kind: BotKind, ctx: BotContext): Action {
  return kind === 'random' ? randomBot(ctx) : sensibleBot(ctx);
}

/** Net worth helper re-exported for reports. */
export { netWorth };
