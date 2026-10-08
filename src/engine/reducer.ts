// reduce(state, action) -> { state, events, error }. Pure: no React, DOM, timers, Date.now or
// Math.random. The input state is never mutated; handlers work on a fresh clone.
import { BALANCE } from '../data/balance.js';
import { COUNTRY_CITIES } from '../data/board.js';
import { foldBid, placeBid } from './auction.js';
import { doBuild, doMortgage, doSell, doUnmortgage } from './building.js';
import { applyCard, discardCard } from './cards.js';
import { type Ctx, changeCash, cloneState, countryOf, currentPlayer, deepCopy, emit, prop } from './core.js';
import { canRaiseMoney, goBankrupt, payHeadDebt, settleDebts } from './debt.js';
import { freeActor, validateAction } from './legal.js';
import {
  afterResolution,
  buyProperty,
  declineProperty,
  endOfMove,
  enterTurnStart,
  leaveJail,
  movementRoll,
  passTurn,
  payJailFine,
  payRentDue,
  rollDice,
  rollForDoubles,
  setRentDue,
  teleport,
} from './phases.js';
import { removePlayer } from './remove.js';
import { companyRent } from './rent.js';
import { applyTrade, tradeBlocker } from './trade.js';
import type { Action, GameState, ReduceResult } from './types.js';

export function reduce(state: GameState, action: Action): ReduceResult {
  const error = validateAction(state, action);
  if (error) return { state, events: [], error };
  const c: Ctx = { s: cloneState(state), events: [] };
  apply(c, action);
  return { state: c.s, events: c.events, error: null };
}

function apply(c: Ctx, action: Action): void {
  const s = c.s;
  const pending = s.flow.pending;
  switch (action.type) {
    case 'setPassDevice':
      s.meta.settings.passDevice = action.on;
      emit(c, { type: 'settingChanged', setting: 'passDevice' });
      if (!action.on && s.flow.phase === 'PassDevice') enterTurnStart(c);
      return;
    case 'setAnimationSpeed':
      s.meta.settings.animationSpeed = action.speed;
      emit(c, { type: 'settingChanged', setting: 'animationSpeed' });
      return;
    case 'debug':
      applyDebug(c, action);
      return;
    case 'removePlayer':
      removePlayer(c, action.player);
      return;
    case 'acknowledge':
      if (s.flow.notices.length > 0) {
        s.flow.notices.shift();
        return;
      }
      // Vacation: this turn is skipped exactly once.
      currentPlayer(s).skipNextTurn = false;
      emit(c, { type: 'turnSkipped', player: s.turn.currentPlayerIndex });
      s.flow.pending = null;
      passTurn(c);
      return;
    case 'ready':
      enterTurnStart(c);
      return;
    case 'payJailFine':
      payJailFine(c);
      return;
    case 'useJailCard': {
      const p = currentPlayer(s);
      discardCard(s, p.jailCards.shift() as string);
      leaveJail(c, 'card');
      s.flow.phase = 'AwaitRoll';
      s.flow.pending = null;
      return;
    }
    case 'rollForDoubles':
      rollForDoubles(c);
      return;
    case 'roll':
      movementRoll(c);
      return;
    case 'buy':
      if (pending?.kind === 'buy') buyProperty(c, pending.space);
      return;
    case 'decline':
      if (pending?.kind === 'buy') declineProperty(c, pending.space);
      return;
    case 'bid':
      if (pending?.kind === 'auction') placeBid(c, pending.auction, action.amount);
      return;
    case 'fold':
      if (pending?.kind === 'auction') foldBid(c, pending.auction);
      return;
    case 'payRent':
      if (pending?.kind === 'rent') payRentDue(c, pending.rent);
      return;
    case 'useFreeStay': {
      if (pending?.kind !== 'rent') return;
      const p = s.players[pending.rent.payer];
      if (!p) return;
      p.freeStay -= 1;
      emit(c, {
        type: 'freeStayUsed',
        player: p.id,
        space: pending.rent.space,
        owner: pending.rent.creditor as number,
        saved: pending.rent.amount,
        left: p.freeStay,
      });
      s.flow.pending = null;
      afterResolution(c);
      return;
    }
    case 'rollCompanyDice': {
      if (pending?.kind !== 'companyRoll') return;
      const dice = rollDice(c);
      // Company dice never count as doubles and never move the token.
      emit(c, { type: 'diceRolled', player: s.turn.currentPlayerIndex, dice, purpose: 'company', doubles: false });
      const quote = companyRent(s, pending.space, dice);
      setRentDue(c, {
        space: pending.space,
        payer: s.turn.currentPlayerIndex,
        creditor: pending.owner,
        amount: quote.amount,
        calc: quote.calc,
        freeStayAllowed: false,
      });
      return;
    }
    case 'confirmCard':
      if (pending?.kind === 'card') applyCard(c, pending.cardId);
      return;
    case 'openBuild':
      s.flow.phase = 'BuildOffer';
      s.flow.pending = { kind: 'build', space: s.turn.landedCity as number };
      return;
    case 'build':
      doBuild(c, s.turn.currentPlayerIndex, action.space);
      return;
    case 'finishBuilding':
      endOfMove(c);
      return;
    case 'sellBuilding':
      doSell(c, freeActor(s) as number, action.space);
      bankruptIfStuck(c);
      return;
    case 'mortgage':
      doMortgage(c, freeActor(s) as number, action.space);
      bankruptIfStuck(c);
      return;
    case 'unmortgage':
      doUnmortgage(c, freeActor(s) as number, action.space);
      return;
    case 'payDebt':
      payHeadDebt(c);
      return;
    case 'declareBankruptcy': {
      const debt = s.flow.debts[0];
      if (!debt) return;
      goBankrupt(c, debt.debtor, debt.creditor);
      if (s.flow.phase !== 'GameOver') settleDebts(c);
      return;
    }
    case 'proposeTrade':
      s.flow.trade = deepCopy(action.offer);
      emit(c, { type: 'tradeProposed', from: action.offer.from, to: action.offer.to });
      return;
    case 'respondTrade': {
      const offer = s.flow.trade;
      s.flow.trade = null;
      if (!offer) return;
      if (action.accept && tradeBlocker(s, offer) === null) applyTrade(c, offer);
      else emit(c, { type: 'tradeRejected', from: offer.from, to: offer.to });
      bankruptIfStuck(c);
      return;
    }
    case 'endTurn':
      emit(c, { type: 'turnEnded', player: s.turn.currentPlayerIndex });
      passTurn(c);
      return;
  }
}

/**
 * Bankruptcy is automatic once a debtor who still cannot pay has no buildings and no unmortgaged
 * properties left (7.4), for example right after mortgaging their last property.
 */
function bankruptIfStuck(c: Ctx): void {
  const s = c.s;
  const debt = s.flow.debts[0];
  if (s.flow.phase !== 'Debt' || s.flow.trade !== null || !debt) return;
  const debtor = s.players[debt.debtor];
  if (!debtor || debtor.cash >= debt.amount || canRaiseMoney(s, debt.debtor)) return;
  goBankrupt(c, debt.debtor, debt.creditor);
  if (!isOver(s)) settleDebts(c);
}

/** Read through a function so TypeScript does not keep a phase narrowed across mutations. */
function isOver(s: GameState): boolean {
  return s.flow.phase === 'GameOver';
}

function applyDebug(c: Ctx, action: Extract<Action, { type: 'debug' }>): void {
  const s = c.s;
  switch (action.op) {
    case 'setNextDice':
      s.meta.forcedDice.push([action.dice[0], action.dice[1]]);
      break;
    case 'movePlayer':
      teleport(c, action.player, action.space, 'debug');
      break;
    case 'cash': {
      const p = s.players[action.player];
      if (p) changeCash(c, action.player, Math.max(action.delta, -p.cash), 'debug');
      break;
    }
    case 'setOwner': {
      const ps = prop(s, action.space);
      ps.owner = action.owner;
      ps.mortgaged = action.owner === null ? false : ps.mortgaged;
      // Buildings need a whole country, so changing an owner clears that country's buildings.
      const country = countryOf(action.space);
      if (country !== null) for (const sp of COUNTRY_CITIES[country]) prop(s, sp).level = 0;
      break;
    }
    case 'setLevel':
      prop(s, action.space).level = Math.max(0, Math.min(BALANCE.hotelLevel, action.level));
      break;
    case 'setMortgaged':
      prop(s, action.space).mortgaged = action.mortgaged;
      break;
    case 'forceCard':
      s.meta.forcedCards[action.deck] = action.cardId;
      break;
  }
  emit(c, { type: 'debugApplied', op: action.op });
}
