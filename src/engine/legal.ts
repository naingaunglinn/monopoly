// Who decides now, what they may do, and why anything else is refused. legalActions() and
// reduce() share validateAction(), so the UI, the bots and the reducer always agree.
import { BALANCE } from '../data/balance';
import { BOARD, propertyPrice } from '../data/board';
import { minimumBid } from './auction';
import { buildBlocker, mortgageBlocker, sellBlocker, unmortgageBlocker } from './building';
import { cardById, isKnownCard } from './cards';
import { currentPlayer, livingPlayers, makeError } from './core';
import { canOfferBuild } from './phases';
import { tradeBlocker } from './trade';
import type { Action, EngineError, GameState, LegalAction, Player } from './types';

/** The player whose decision it is (the one holding the device), or null when the game is over. */
export function decisionMaker(s: GameState): number | null {
  if (s.flow.notices.length > 0) return s.turn.currentPlayerIndex;
  if (s.flow.phase === 'GameOver') return null;
  if (s.flow.trade) return s.flow.trade.to;
  if (s.flow.pending?.kind === 'auction') return s.flow.pending.auction.current;
  if (s.flow.phase === 'Debt') return s.flow.debts[0]?.debtor ?? s.turn.currentPlayerIndex;
  return s.turn.currentPlayerIndex;
}

/**
 * Who may trade, mortgage, unmortgage or sell buildings right now: the current player whenever no
 * decision is pending (including Jail choices and the optional build offer), or the debtor.
 */
export function freeActor(s: GameState): number | null {
  if (s.flow.notices.length > 0 || s.flow.trade !== null) return null;
  switch (s.flow.phase) {
    case 'TurnStart':
      return s.flow.pending?.kind === 'jailChoice' ? s.turn.currentPlayerIndex : null;
    case 'AwaitRoll':
    case 'AwaitEndTurn':
    case 'BuildOffer':
      return s.turn.currentPlayerIndex;
    case 'Debt':
      return s.flow.debts[0]?.debtor ?? null;
    default:
      return null;
  }
}

const wrong = (): EngineError => makeError('wrongPhase');

function isDieFace(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6;
}

function validateDebug(s: GameState, action: Extract<Action, { type: 'debug' }>): EngineError | null {
  const bad = makeError('invalidAction');
  const validPlayer = (id: number) => Number.isInteger(id) && s.players[id] !== undefined && !s.players[id]?.bankrupt;
  switch (action.op) {
    case 'setNextDice':
      return Array.isArray(action.dice) && isDieFace(action.dice[0]) && isDieFace(action.dice[1]) ? null : bad;
    case 'movePlayer':
      return validPlayer(action.player) && BOARD[action.space] !== undefined ? null : bad;
    case 'cash':
      return validPlayer(action.player) && Number.isInteger(action.delta) ? null : bad;
    case 'setOwner':
      return s.properties[action.space] && (action.owner === null || validPlayer(action.owner)) ? null : bad;
    case 'setLevel': {
      const ps = s.properties[action.space];
      const isCity = BOARD[action.space]?.type === 'city';
      return isCity && ps && ps.owner !== null && Number.isInteger(action.level) && action.level >= 0 &&
        action.level <= BALANCE.hotelLevel
        ? null
        : bad;
    }
    case 'setMortgaged': {
      const ps = s.properties[action.space];
      return ps && ps.owner !== null && typeof action.mortgaged === 'boolean' ? null : bad;
    }
    case 'forceCard':
      return isKnownCard(action.cardId) && cardById(action.cardId).deck === action.deck ? null : bad;
  }
}

/** Null when the action is legal now; otherwise a typed error with a plain-language reason. */
export function validateAction(s: GameState, action: Action): EngineError | null {
  if (!action || typeof action !== 'object') return makeError('invalidAction');
  switch (action.type) {
    case 'setPassDevice':
      return typeof action.on === 'boolean' ? null : makeError('invalidAction');
    case 'setAnimationSpeed':
      return ['normal', 'fast', 'off'].includes(action.speed) ? null : makeError('invalidAction');
    case 'debug':
      return validateDebug(s, action);
    default:
      break;
  }
  if (s.flow.notices.length > 0) return action.type === 'acknowledge' ? null : makeError('noticePending');
  if (s.flow.phase === 'GameOver') return makeError('gameOver');
  if (s.flow.trade !== null) {
    if (action.type === 'respondTrade') return typeof action.accept === 'boolean' ? null : makeError('invalidAction');
    return makeError('tradePending', { player: s.players[s.flow.trade.to]?.name ?? '' });
  }

  const phase = s.flow.phase;
  const pending = s.flow.pending;
  const me = currentPlayer(s);

  switch (action.type) {
    case 'ready':
      return phase === 'PassDevice' ? null : wrong();
    case 'acknowledge':
      return phase === 'TurnStart' && pending?.kind === 'vacationSkip' ? null : wrong();
    case 'payJailFine':
      if (phase !== 'TurnStart' || pending?.kind !== 'jailChoice') return wrong();
      return me.cash >= BALANCE.jailFine ? null : makeError('notEnoughCash', { needed: BALANCE.jailFine, have: me.cash });
    case 'useJailCard':
      if (phase !== 'TurnStart' || pending?.kind !== 'jailChoice') return wrong();
      return me.jailCards.length > 0 ? null : makeError('noJailCard');
    case 'rollForDoubles':
      return phase === 'TurnStart' && pending?.kind === 'jailChoice' ? null : wrong();
    case 'roll':
      return phase === 'AwaitRoll' ? null : wrong();
    case 'buy': {
      if (phase !== 'BuyDecision' || pending?.kind !== 'buy') return wrong();
      const price = propertyPrice(pending.space);
      return me.cash >= price ? null : makeError('notEnoughCash', { needed: price, have: me.cash });
    }
    case 'decline':
      return phase === 'BuyDecision' ? null : wrong();
    case 'bid': {
      if (phase !== 'Auction' || pending?.kind !== 'auction') return wrong();
      const a = pending.auction;
      const bidder = s.players[a.current] as Player;
      if (typeof action.amount !== 'number' || !Number.isInteger(action.amount)) return makeError('invalidAmount');
      if (action.amount < minimumBid(a)) return makeError('bidTooLow', { min: minimumBid(a) });
      if (action.amount > bidder.cash) return makeError('bidTooHigh', { cash: bidder.cash });
      return null;
    }
    case 'fold':
      return phase === 'Auction' ? null : wrong();
    case 'payRent':
      return phase === 'RentDue' ? null : wrong();
    case 'useFreeStay': {
      if (phase !== 'RentDue' || pending?.kind !== 'rent') return wrong();
      const payer = s.players[pending.rent.payer] as Player;
      return pending.rent.freeStayAllowed && s.meta.settings.freeStay && payer.freeStay > 0
        ? null
        : makeError('freeStayUnavailable');
    }
    case 'rollCompanyDice':
      return phase === 'CompanyRoll' ? null : wrong();
    case 'confirmCard':
      return phase === 'CardReveal' ? null : wrong();
    case 'openBuild':
      return (phase === 'AwaitRoll' || phase === 'AwaitEndTurn') && canOfferBuild(s) ? null : wrong();
    case 'build':
      if (phase !== 'BuildOffer' || pending?.kind !== 'build' || action.space !== pending.space) {
        return makeError('notLandedHere');
      }
      return buildBlocker(s, me.id, action.space);
    case 'finishBuilding':
      return phase === 'BuildOffer' ? null : wrong();
    case 'sellBuilding': {
      const actor = freeActor(s);
      return actor === null ? wrong() : sellBlocker(s, actor, action.space);
    }
    case 'mortgage': {
      const actor = freeActor(s);
      return actor === null ? wrong() : mortgageBlocker(s, actor, action.space);
    }
    case 'unmortgage': {
      const actor = freeActor(s);
      if (actor === null) return wrong();
      if (phase === 'Debt') return makeError('noUnmortgageInDebt');
      return unmortgageBlocker(s, actor, action.space);
    }
    case 'payDebt': {
      if (phase !== 'Debt') return wrong();
      const debt = s.flow.debts[0];
      if (!debt) return wrong();
      const cash = (s.players[debt.debtor] as Player).cash;
      return cash >= debt.amount ? null : makeError('debtNotCovered', { shortfall: debt.amount - cash });
    }
    case 'declareBankruptcy':
      return phase === 'Debt' && s.flow.debts.length > 0 ? null : wrong();
    case 'proposeTrade': {
      const actor = freeActor(s);
      if (actor === null || !action.offer || action.offer.from !== actor) return wrong();
      return tradeBlocker(s, action.offer);
    }
    case 'respondTrade':
      return wrong();
    case 'endTurn':
      return phase === 'AwaitEndTurn' ? null : wrong();
    default:
      return makeError('invalidAction');
  }
}

export function isLegal(s: GameState, action: Action): boolean {
  return validateAction(s, action) === null;
}

/** Quick raises offered in an auction: the minimum bid and +$10, +$50, +$100 over the high bid. */
export function auctionBidOptions(s: GameState): number[] {
  if (s.flow.pending?.kind !== 'auction') return [];
  const a = s.flow.pending.auction;
  const cash = (s.players[a.current] as Player).cash;
  const options = [minimumBid(a), ...BALANCE.auctionRaises.map((r) => a.highBid + r)];
  return [...new Set(options)].filter((amount) => amount >= minimumBid(a) && amount <= cash);
}

/** Everything the current decision-maker can do now. */
export function legalActions(s: GameState): LegalAction[] {
  if (s.flow.notices.length > 0) return [{ type: 'acknowledge' }];
  if (s.flow.phase === 'GameOver') return [];
  if (s.flow.trade !== null) {
    return [
      { type: 'respondTrade', accept: true },
      { type: 'respondTrade', accept: false },
    ];
  }
  const out: LegalAction[] = [];
  const consider = (action: Action) => {
    if (validateAction(s, action) === null) out.push(action as LegalAction);
  };
  const pending = s.flow.pending;
  switch (s.flow.phase) {
    case 'PassDevice':
      consider({ type: 'ready' });
      break;
    case 'TurnStart':
      if (pending?.kind === 'vacationSkip') consider({ type: 'acknowledge' });
      else {
        consider({ type: 'payJailFine' });
        consider({ type: 'useJailCard' });
        consider({ type: 'rollForDoubles' });
      }
      break;
    case 'AwaitRoll':
      consider({ type: 'roll' });
      consider({ type: 'openBuild' });
      break;
    case 'BuyDecision':
      consider({ type: 'buy' });
      consider({ type: 'decline' });
      break;
    case 'Auction':
      for (const amount of auctionBidOptions(s)) consider({ type: 'bid', amount });
      consider({ type: 'fold' });
      break;
    case 'RentDue':
      consider({ type: 'payRent' });
      consider({ type: 'useFreeStay' });
      break;
    case 'CompanyRoll':
      consider({ type: 'rollCompanyDice' });
      break;
    case 'CardReveal':
      consider({ type: 'confirmCard' });
      break;
    case 'BuildOffer':
      if (pending?.kind === 'build') consider({ type: 'build', space: pending.space });
      consider({ type: 'finishBuilding' });
      break;
    case 'Debt':
      consider({ type: 'payDebt' });
      consider({ type: 'declareBankruptcy' });
      break;
    case 'AwaitEndTurn':
      consider({ type: 'endTurn' });
      consider({ type: 'openBuild' });
      break;
  }
  const actor = freeActor(s);
  if (actor !== null) {
    s.properties.forEach((ps, space) => {
      if (!ps || ps.owner !== actor) return;
      if (ps.level > 0) consider({ type: 'sellBuilding', space });
      if (ps.mortgaged) consider({ type: 'unmortgage', space });
      else consider({ type: 'mortgage', space });
    });
    if (livingPlayers(s).length > 1) out.push({ type: 'proposeTrade', offer: null });
  }
  return out;
}

