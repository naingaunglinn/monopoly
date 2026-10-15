// Who decides now, what they may do, and why anything else is refused. legalActions() and
// reduce() share validateAction(), so the UI, the bots and the reducer always agree.
import { BALANCE, MYANMAR } from '../data/balance.js';
import { BOARD, COUNTRY_CITIES, propertyPrice, RULES, useMap } from '../data/board.js';
import { COUNTRY_BY_ID } from '../data/countries.js';
import { minimumBid } from './auction.js';
import { buildBlocker, mortgageBlocker, sellBlocker, unmortgageBlocker } from './building.js';
import { cardById, isKnownCard } from './cards.js';
import { countryOf, currentPlayer, livingPlayers, makeError } from './core.js';
import { powerReady, powerVictim, seizable } from './general.js';
import { loanOfferBlocker, loanOwed } from './loans.js';
import { cancellableCard, draftChoiceBlocker, draftPayCost, tradeBlockedFor } from './myanmar.js';
import { canOfferBuild } from './phases.js';
import { tradeBlocker } from './trade.js';
import type { Action, EngineError, GameState, LegalAction, Player } from './types.js';

/** The player whose decision it is (the one holding the device), or null when the game is over. */
export function decisionMaker(s: GameState): number | null {
  if (s.flow.notices.length > 0) return s.turn.currentPlayerIndex;
  if (s.flow.phase === 'GameOver') return null;
  if (s.flow.trade) return s.flow.trade.to;
  if (s.flow.loan) return s.flow.loan.to;
  if (s.flow.pending?.kind === 'auction') return s.flow.pending.auction.current;
  // Myanmar map (D107): the unrest window waits on its players in seat order; a bribe on its receiver.
  if (s.flow.pending?.kind === 'unrest') return s.flow.pending.waiting[0] ?? s.turn.currentPlayerIndex;
  if (s.flow.pending?.kind === 'bribe') return s.flow.pending.to;
  if (s.flow.phase === 'Debt') return s.flow.debts[0]?.debtor ?? s.turn.currentPlayerIndex;
  return s.turn.currentPlayerIndex;
}

/**
 * Who may trade, mortgage, unmortgage or sell buildings right now: the current player whenever no
 * decision is pending (including Jail choices and the optional build offer), or the debtor.
 */
export function freeActor(s: GameState): number | null {
  if (s.flow.notices.length > 0 || s.flow.trade !== null || s.flow.loan !== null) return null;
  switch (s.flow.phase) {
    case 'TurnStart':
      // The Jail choice and the call-up choice (Myanmar map) leave time to raise money.
      return s.flow.pending?.kind === 'jailChoice' || s.flow.pending?.kind === 'draftChoice' ? s.turn.currentPlayerIndex : null;
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

/**
 * Trading is open when the game is between decisions: whenever there is a free actor (no decision
 * pending, or a debt being raised) and no offer is on the table. Then any player may make an offer,
 * whoever's turn it is (D99).
 */
export function tradingOpen(s: GameState): boolean {
  return freeActor(s) !== null && livingPlayers(s).length > 1;
}

/**
 * The player who must send this action now (online play checks it): mortgaging and selling belong
 * to the free actor, an offer to the player making it, taking an offer back to the player who made
 * it, and every other game action (including answering an offer) to the decision maker. Settings,
 * debug and removePlayer belong to no player.
 */
export function actorFor(s: GameState, action: Action): number | null {
  switch (action.type) {
    case 'sellBuilding':
    case 'mortgage':
    case 'unmortgage':
      return freeActor(s);
    case 'proposeTrade':
      return action.offer && Number.isInteger(action.offer.from) && s.players[action.offer.from] ? action.offer.from : null;
    case 'withdrawTrade':
      return s.flow.trade?.from ?? null;
    case 'requestLoan':
      return action.offer && Number.isInteger(action.offer.from) && s.players[action.offer.from] ? action.offer.from : null;
    case 'withdrawLoan':
      return s.flow.loan?.from ?? null;
    case 'repayLoan':
      return freeActor(s);
    case 'unrestAnswer':
      // Every player in the window answers for themselves, in any order (D107).
      return Number.isInteger(action.player) && s.players[action.player] ? action.player : null;
    case 'setPassDevice':
    case 'setAnimationSpeed':
    case 'debug':
    case 'removePlayer':
      return null;
    default:
      return decisionMaker(s);
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
  useMap(s);
  if (!action || typeof action !== 'object') return makeError('invalidAction');
  switch (action.type) {
    case 'setPassDevice':
      return typeof action.on === 'boolean' ? null : makeError('invalidAction');
    case 'setAnimationSpeed':
      return ['normal', 'fast', 'off'].includes(action.speed) ? null : makeError('invalidAction');
    case 'debug':
      return validateDebug(s, action);
    case 'removePlayer': {
      if (s.flow.phase === 'GameOver') return makeError('gameOver');
      const p = Number.isInteger(action.player) ? s.players[action.player] : undefined;
      return p && !p.bankrupt ? null : makeError('invalidAction');
    }
    default:
      break;
  }
  if (s.flow.notices.length > 0) return action.type === 'acknowledge' ? null : makeError('noticePending');
  if (s.flow.phase === 'GameOver') return makeError('gameOver');
  const trade = s.flow.trade;
  if (trade !== null) {
    switch (action.type) {
      case 'respondTrade':
        return typeof action.accept === 'boolean' ? null : makeError('invalidAction');
      case 'counterTrade': {
        // A counter-offer goes back the other way: from the partner to the player who offered.
        const offer = action.offer;
        if (!offer || typeof offer !== 'object' || offer.from !== trade.to || offer.to !== trade.from) return makeError('invalidAction');
        if (tradeBlockedFor(s, offer.from)) return makeError('tradeBlocked');
        return tradeBlocker(s, offer);
      }
      case 'withdrawTrade':
        return null;
      default:
        return makeError('tradePending', { player: s.players[trade.to]?.name ?? '' });
    }
  }
  // Myanmar map: a loan offer on the table waits for its answer, like a trade (D104).
  const loan = s.flow.loan;
  if (loan !== null) {
    switch (action.type) {
      case 'respondLoan': {
        if (typeof action.accept !== 'boolean') return makeError('invalidAction');
        if (!action.accept) return null;
        const blocked = loanOfferBlocker(s, loan);
        if (blocked) return blocked;
        const lender = s.players[loan.lender] as Player;
        return lender.cash >= loan.amount ? null : makeError('notEnoughCash', { needed: loan.amount, have: lender.cash });
      }
      case 'counterLoan': {
        const offer = action.offer;
        if (!offer || typeof offer !== 'object' || offer.from !== loan.to || offer.to !== loan.from) return makeError('invalidAction');
        if (offer.lender !== loan.lender || offer.borrower !== loan.borrower) return makeError('invalidAction');
        if (tradeBlockedFor(s, offer.from)) return makeError('tradeBlocked');
        return loanOfferBlocker(s, offer);
      }
      case 'withdrawLoan':
        return null;
      default:
        return makeError('loanPending', { player: s.players[loan.to]?.name ?? '' });
    }
  }

  const phase = s.flow.phase;
  const pending = s.flow.pending;
  const me = currentPlayer(s);

  switch (action.type) {
    case 'ready':
      return phase === 'PassDevice' ? null : wrong();
    case 'acknowledge':
      return phase === 'TurnStart' && (pending?.kind === 'vacationSkip' || pending?.kind === 'draftSkip') ? null : wrong();
    case 'draftChoose': {
      if (phase !== 'TurnStart' || pending?.kind !== 'draftChoice') return wrong();
      if (!['pay', 'hide', 'flee', 'serve', 'merit', 'card'].includes(action.how)) return makeError('invalidAction');
      const blocked = draftChoiceBlocker(me, action.how);
      if (blocked === 'cash') {
        const needed = action.how === 'pay' ? draftPayCost(me.cash) : MYANMAR.draftFleeCost;
        return makeError('notEnoughCash', { needed, have: me.cash });
      }
      if (blocked === 'merit') return makeError('noMerit');
      if (blocked === 'card') return makeError('noJailCard');
      return null;
    }
    case 'leaveDraft':
      if (phase !== 'TurnStart' || pending?.kind !== 'draftSkip') return wrong();
      if (action.how === 'merit') return me.merit > 0 ? null : makeError('noMerit');
      if (action.how === 'card') return me.jailCards.length > 0 ? null : makeError('noJailCard');
      return makeError('invalidAction');
    case 'donate':
      if (phase !== 'BuyDecision' || pending?.kind !== 'donation' || typeof action.give !== 'boolean') return wrong();
      if (!action.give) return null;
      if (me.merit >= MYANMAR.meritMax) return makeError('meritFull');
      return me.cash >= MYANMAR.meritDonation ? null : makeError('notEnoughCash', { needed: MYANMAR.meritDonation, have: me.cash });
    case 'useMerit': {
      if (!RULES.merit) return wrong();
      // A rent owed to a player, or a bad Chance card (spec 7.2).
      if (phase === 'RentDue' && pending?.kind === 'rent' && pending.rent.creditor !== null) {
        return (s.players[pending.rent.payer] as Player).merit > 0 ? null : makeError('noMerit');
      }
      if (phase === 'CardReveal' && pending?.kind === 'card' && cancellableCard(pending.cardId)) {
        return me.merit > 0 ? null : makeError('noMerit');
      }
      return wrong();
    }
    case 'usePower':
      return powerReady(s) ? null : makeError('powerNotReady');
    case 'powerTarget': {
      if (phase !== 'BuyDecision' || pending?.kind !== 'powerTarget') return wrong();
      const target = Number.isInteger(action.player) ? s.players[action.player] : undefined;
      if (!target || target.bankrupt || target.id === me.id) return makeError('powerTarget');
      // The power hits the richest player, not one the general picks (D115).
      if (target.id !== powerVictim(s, pending.outcome)) return makeError('powerTarget');
      if (pending.outcome === 'money') return action.space === null ? null : makeError('powerTarget');
      return action.space !== null && seizable(s, target.id).includes(action.space) ? null : makeError('powerTarget');
    }
    case 'unrestAnswer': {
      if (phase !== 'BuyDecision' || pending?.kind !== 'unrest') return wrong();
      if (!pending.waiting.includes(action.player) || typeof action.use !== 'boolean' || typeof action.block !== 'boolean') return wrong();
      if (action.use && action.block) return makeError('invalidAction');
      const p = s.players[action.player] as Player;
      if (action.use && (p.unrest <= 0 || s.economy.bribed.includes(p.id))) return makeError('unrestNone');
      if (action.block && (action.player !== pending.target || p.merit < MYANMAR.powerBlockMerit)) return makeError('meritShort');
      return null;
    }
    case 'offerBribe': {
      if (!powerReady(s)) return makeError('powerNotReady');
      const to = Number.isInteger(action.to) ? s.players[action.to] : undefined;
      if (!to || to.bankrupt || to.id === me.id || to.unrest <= 0 || s.economy.bribed.includes(to.id)) return makeError('unrestNone');
      if (!Number.isInteger(action.amount) || action.amount < 1) return makeError('invalidAmount');
      return me.cash >= action.amount ? null : makeError('notEnoughCash', { needed: action.amount, have: me.cash });
    }
    case 'respondBribe':
      return phase === 'BuyDecision' && pending?.kind === 'bribe' && typeof action.accept === 'boolean' ? null : wrong();
    case 'buyTicket': {
      if (phase !== 'CardReveal' || pending?.kind !== 'card') return wrong();
      const effect = cardById(pending.cardId).effect;
      if (effect.type !== 'lottery') return wrong();
      return me.cash >= effect.ticket ? null : makeError('notEnoughCash', { needed: effect.ticket, have: me.cash });
    }
    case 'brokerPay': {
      if (phase !== 'CardReveal' || pending?.kind !== 'card') return wrong();
      const effect = cardById(pending.cardId).effect;
      if (effect.type !== 'broker') return wrong();
      return me.cash >= effect.amount ? null : makeError('notEnoughCash', { needed: effect.amount, have: me.cash });
    }
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
      if (RULES.general && me.rank >= MYANMAR.noBuyRank) return makeError('rankNoBuy', { player: me.name });
      const price = propertyPrice(pending.space);
      return me.cash >= price ? null : makeError('notEnoughCash', { needed: price, have: me.cash });
    }
    case 'decline':
      return phase === 'BuyDecision' && pending?.kind === 'buy' ? null : wrong();
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
      // Any city in the country of the city just landed on (D98); buildBlocker checks the rest.
      if (phase !== 'BuildOffer' || pending?.kind !== 'build') {
        const country = countryOf(action.space);
        return makeError('notLandedHere', { country: country ? COUNTRY_BY_ID[country].name : '' });
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
      if (!action.offer || typeof action.offer !== 'object') return makeError('invalidAction');
      // Any player may offer while the game is between decisions (D99).
      if (!tradingOpen(s)) {
        const waiting = decisionMaker(s);
        return makeError('tradeWait', { player: waiting === null ? '' : (s.players[waiting]?.name ?? '') });
      }
      // Myanmar map: during an internet cut only the owner of MPT may offer (D102).
      if (tradeBlockedFor(s, action.offer.from)) return makeError('tradeBlocked');
      return tradeBlocker(s, action.offer);
    }
    case 'respondTrade':
    case 'counterTrade':
    case 'withdrawTrade':
      return wrong();
    case 'requestLoan': {
      if (!RULES.loans) return wrong();
      const offer = action.offer;
      if (!offer || typeof offer !== 'object' || offer.from !== offer.borrower) return makeError('invalidAction');
      // Asked for between decisions, like a trade offer (D99, D104).
      if (!tradingOpen(s)) {
        const waiting = decisionMaker(s);
        return makeError('tradeWait', { player: waiting === null ? '' : (s.players[waiting]?.name ?? '') });
      }
      if (tradeBlockedFor(s, offer.from)) return makeError('tradeBlocked');
      return loanOfferBlocker(s, offer);
    }
    case 'respondLoan':
    case 'counterLoan':
    case 'withdrawLoan':
      return wrong();
    case 'repayLoan': {
      // The borrower, on their own turn between decisions; never while raising money (Debt).
      if (!RULES.loans || phase === 'Debt') return wrong();
      const l = s.economy.loans.find((x) => x.id === action.loanId);
      if (!l || freeActor(s) !== l.borrower || s.turn.currentPlayerIndex !== l.borrower) return wrong();
      const max = Math.min(loanOwed(s, l), (s.players[l.borrower] as Player).cash);
      return Number.isInteger(action.amount) && action.amount >= 1 && action.amount <= max ? null : makeError('loanRepay', { max });
    }
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
  useMap(s);
  if (s.flow.notices.length > 0) return [{ type: 'acknowledge' }];
  if (s.flow.phase === 'GameOver') return [];
  if (s.flow.trade !== null) {
    return [
      { type: 'respondTrade', accept: true },
      { type: 'respondTrade', accept: false },
      // Myanmar map: during an internet cut only the owner of MPT may counter (D102).
      ...(tradeBlockedFor(s, s.flow.trade.to) ? [] : [{ type: 'counterTrade', offer: null } as const]),
    ];
  }
  if (s.flow.loan !== null) {
    return [
      ...(validateAction(s, { type: 'respondLoan', accept: true }) === null ? [{ type: 'respondLoan', accept: true } as const] : []),
      { type: 'respondLoan', accept: false },
      ...(tradeBlockedFor(s, s.flow.loan.to) ? [] : [{ type: 'counterLoan', offer: null } as const]),
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
      else if (pending?.kind === 'draftChoice') {
        for (const how of ['pay', 'hide', 'flee', 'serve', 'merit', 'card'] as const) consider({ type: 'draftChoose', how });
      } else if (pending?.kind === 'draftSkip') {
        consider({ type: 'acknowledge' });
        consider({ type: 'leaveDraft', how: 'merit' });
        consider({ type: 'leaveDraft', how: 'card' });
      } else {
        consider({ type: 'payJailFine' });
        consider({ type: 'useJailCard' });
        consider({ type: 'rollForDoubles' });
      }
      break;
    case 'AwaitRoll':
      consider({ type: 'roll' });
      consider({ type: 'openBuild' });
      consider({ type: 'usePower' });
      break;
    case 'BuyDecision':
      consider({ type: 'buy' });
      consider({ type: 'decline' });
      consider({ type: 'donate', give: true });
      consider({ type: 'donate', give: false });
      if (pending?.kind === 'powerTarget') {
        const victim = powerVictim(s, pending.outcome);
        if (victim !== null && pending.outcome === 'money') consider({ type: 'powerTarget', player: victim, space: null });
        else if (victim !== null) for (const space of seizable(s, victim)) consider({ type: 'powerTarget', player: victim, space });
      }
      if (pending?.kind === 'unrest') out.push(...unrestAnswers(s, pending.waiting[0] ?? -1));
      consider({ type: 'respondBribe', accept: true });
      consider({ type: 'respondBribe', accept: false });
      break;
    case 'Auction':
      for (const amount of auctionBidOptions(s)) consider({ type: 'bid', amount });
      consider({ type: 'fold' });
      break;
    case 'RentDue':
      consider({ type: 'payRent' });
      consider({ type: 'useFreeStay' });
      consider({ type: 'useMerit' });
      break;
    case 'CompanyRoll':
      consider({ type: 'rollCompanyDice' });
      break;
    case 'CardReveal':
      consider({ type: 'confirmCard' });
      consider({ type: 'brokerPay' });
      consider({ type: 'buyTicket' });
      consider({ type: 'useMerit' });
      break;
    case 'BuildOffer':
      if (pending?.kind === 'build') {
        const country = countryOf(pending.space);
        if (country !== null) for (const space of COUNTRY_CITIES[country]) consider({ type: 'build', space });
      }
      consider({ type: 'finishBuilding' });
      break;
    case 'Debt':
      consider({ type: 'payDebt' });
      consider({ type: 'declareBankruptcy' });
      break;
    case 'AwaitEndTurn':
      consider({ type: 'endTurn' });
      consider({ type: 'openBuild' });
      consider({ type: 'usePower' });
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
    if (livingPlayers(s).length > 1 && !tradeBlockedFor(s, actor)) out.push({ type: 'proposeTrade', offer: null });
    // Myanmar map: ask for a loan; the borrower may pay back on their own turn (D104).
    if (RULES.loans && livingPlayers(s).length > 1 && !tradeBlockedFor(s, actor)) out.push({ type: 'requestLoan', offer: null });
    if (RULES.loans) {
      const cash = (s.players[actor] as Player).cash;
      for (const l of s.economy.loans) {
        if (l.borrower === actor) consider({ type: 'repayLoan', loanId: l.id, amount: Math.min(loanOwed(s, l), cash) });
      }
    }
    // Myanmar map: the general may offer a bribe while their power is ready (D107).
    if (powerReady(s) && livingPlayers(s).some((p) => validateAction(s, { type: 'offerBribe', to: p.id, amount: 1 }) === null)) {
      out.push({ type: 'offerBribe', to: null, amount: null });
    }
  }
  return out;
}

/** A player's possible answers in the unrest window (D107). */
function unrestAnswers(s: GameState, player: number): LegalAction[] {
  const out: LegalAction[] = [];
  for (const [use, block] of [
    [false, false],
    [true, false],
    [false, true],
  ] as const) {
    const action = { type: 'unrestAnswer', player, use, block } as const;
    if (validateAction(s, action) === null) out.push(action);
  }
  return out;
}

/**
 * Everything this player can do now: the decision maker's actions (legalActions), and for anyone
 * else an offer while trading is open, and taking back their own offer on the table (D99).
 */
export function legalActionsFor(s: GameState, player: number): LegalAction[] {
  useMap(s);
  const out = decisionMaker(s) === player ? legalActions(s) : [];
  const p = s.players[player];
  if (!p || p.bankrupt || s.flow.notices.length > 0 || s.flow.phase === 'GameOver') return out;
  if (s.flow.trade?.from === player) out.push({ type: 'withdrawTrade' });
  // Myanmar map: everyone in the unrest window answers in any order (D107).
  const pending = s.flow.pending;
  if (pending?.kind === 'unrest' && pending.waiting.includes(player) && decisionMaker(s) !== player) out.push(...unrestAnswers(s, player));
  if (s.flow.loan?.from === player) out.push({ type: 'withdrawLoan' });
  if (RULES.loans && tradingOpen(s) && !tradeBlockedFor(s, player) && !out.some((a) => a.type === 'requestLoan')) {
    out.push({ type: 'requestLoan', offer: null });
  }
  if (tradingOpen(s) && !tradeBlockedFor(s, player) && !out.some((a) => a.type === 'proposeTrade')) {
    out.push({ type: 'proposeTrade', offer: null });
  }
  return out;
}

