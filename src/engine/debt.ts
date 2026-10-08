// Debt and bankruptcy (spec 7.3, 7.4). Payments go through a queue processed in order; the head
// of the queue may belong to any player (card effects can put other players in debt).
import { CITY_BY_SPACE } from '../data/board';
import { discardCard } from './cards';
import {
  type Ctx,
  changeCash,
  emit,
  livingPlayers,
  playerById,
  propertiesOwnedBy,
  transfer,
} from './core';
import { afterResolution, endGame, leaveJail, moveSteps, passTurn } from './phases';
import { sellRefund } from './rent';
import type { DebtItem, GameState, MoneyReason, Resume } from './types';

export function queueDebt(c: Ctx, debt: DebtItem): void {
  if (debt.amount > 0) c.s.flow.debts.push(debt);
}

/** True while the player still has buildings to sell or an unmortgaged property. */
export function canRaiseMoney(s: GameState, playerId: number): boolean {
  return s.properties.some((p) => p !== null && p.owner === playerId && (p.level > 0 || !p.mortgaged));
}

function moneyReason(debt: DebtItem): MoneyReason {
  switch (debt.reason.kind) {
    case 'rent':
      return 'rent';
    case 'tax':
      return 'tax';
    case 'card':
      return 'card';
    case 'jailFine':
      return 'jailFine';
  }
}

/** Pays one queued debt in full (the caller checked the cash). */
export function payDebtItem(c: Ctx, debt: DebtItem): void {
  const reason = debt.reason;
  transfer(c, debt.debtor, debt.creditor, debt.amount, moneyReason(debt), {
    space: reason.kind === 'rent' ? reason.space : null,
    cardId: reason.kind === 'card' ? reason.cardId : null,
  });
  switch (reason.kind) {
    case 'rent':
      emit(c, { type: 'rentPaid', from: debt.debtor, to: debt.creditor as number, space: reason.space, amount: debt.amount });
      break;
    case 'tax':
      emit(c, {
        type: 'feePaid',
        player: debt.debtor,
        amount: debt.amount,
        reason: reason.tax === 'income' ? 'incomeTax' : 'luxuryTax',
      });
      break;
    case 'jailFine':
      emit(c, { type: 'feePaid', player: debt.debtor, amount: debt.amount, reason: 'jailFine' });
      break;
    case 'card':
      if (debt.creditor === null) {
        emit(c, { type: 'cardCash', player: debt.debtor, amount: -debt.amount, cardId: reason.cardId });
      } else {
        emit(c, { type: 'cardTransfer', from: debt.debtor, to: debt.creditor, amount: debt.amount, cardId: reason.cardId });
      }
      break;
  }
}

/**
 * Settles the queue in order. A debtor who cannot pay opens the Debt phase (or goes bankrupt
 * automatically when nothing is left to sell or mortgage). When the queue is empty, the stored
 * continuation runs.
 */
export function settleDebts(c: Ctx): void {
  const s = c.s;
  while (s.flow.debts.length > 0) {
    if (s.flow.phase === 'GameOver') return;
    const debt = s.flow.debts[0] as DebtItem;
    const debtor = playerById(s, debt.debtor);
    const creditorGone = debt.creditor !== null && playerById(s, debt.creditor).bankrupt;
    if (debtor.bankrupt || creditorGone) {
      s.flow.debts.shift();
      continue;
    }
    if (debtor.cash >= debt.amount) {
      s.flow.debts.shift();
      payDebtItem(c, debt);
      continue;
    }
    if (!canRaiseMoney(s, debt.debtor)) {
      goBankrupt(c, debt.debtor, debt.creditor);
      continue;
    }
    s.flow.phase = 'Debt';
    s.flow.pending = { kind: 'debt' };
    emit(c, {
      type: 'debtStarted',
      debtor: debt.debtor,
      creditor: debt.creditor,
      amount: debt.amount,
      shortfall: debt.amount - debtor.cash,
    });
    return;
  }
  if (s.flow.phase === 'GameOver') return;
  const resume = s.flow.resume;
  s.flow.resume = null;
  runResume(c, resume);
}

function runResume(c: Ctx, resume: Resume | null): void {
  if (resume === null || resume.kind === 'afterResolution') {
    c.s.flow.pending = null;
    afterResolution(c);
    return;
  }
  if (resume.kind === 'passTurn') {
    passTurn(c);
    return;
  }
  // Forced Jail fine paid: leave and move the rolled total.
  leaveJail(c, 'forcedFine');
  moveSteps(c, c.s.turn.currentPlayerIndex, resume.total, 'dice');
}

/** The Debt phase's Pay button: the head debt is covered now. */
export function payHeadDebt(c: Ctx): void {
  const debt = c.s.flow.debts.shift() as DebtItem;
  emit(c, { type: 'debtPaid', debtor: debt.debtor, creditor: debt.creditor, amount: debt.amount });
  payDebtItem(c, debt);
  settleDebts(c);
}

/**
 * Bankruptcy (7.4): buildings are sold to the bank at 50% first. A player creditor receives all
 * remaining cash and properties (mortgaged ones stay mortgaged); with the bank as creditor the
 * properties become unowned and unmortgaged. Held cards return to the discard piles.
 */
export function goBankrupt(c: Ctx, playerId: number, creditor: number | null): void {
  const s = c.s;
  const p = playerById(s, playerId);
  const heir = creditor !== null && !playerById(s, creditor).bankrupt && creditor !== playerId ? creditor : null;

  for (const space of CITY_BY_SPACE.keys()) {
    const ps = s.properties[space];
    if (!ps || ps.owner !== playerId) continue;
    while (ps.level > 0) {
      const refund = sellRefund(space, ps.level);
      ps.level -= 1;
      changeCash(c, playerId, refund, 'sell', { space });
    }
  }

  for (const cardId of [...p.jailCards, ...p.houseVouchers]) discardCard(s, cardId);
  p.jailCards = [];
  p.houseVouchers = [];

  const owned = propertiesOwnedBy(s, playerId);
  const cash = p.cash;
  if (heir !== null) {
    for (const space of owned) (s.properties[space] as { owner: number | null }).owner = heir;
    transfer(c, playerId, heir, cash, 'bankruptcy');
  } else {
    for (const space of owned) s.properties[space] = { owner: null, level: 0, mortgaged: false };
    changeCash(c, playerId, -cash, 'bankruptcy');
  }

  s.meta.stats.bankruptcies += 1;
  p.bankrupt = true;
  p.bankruptOrder = s.meta.stats.bankruptcies;
  p.cash = 0;
  p.freeStay = 0;
  p.inJail = false;
  p.jailAttempts = 0;
  p.skipNextTurn = false;
  p.recap = [];

  // Debts owed by or to this player are void now.
  s.flow.debts = s.flow.debts.filter((d) => d.debtor !== playerId && d.creditor !== playerId);
  // Their modifiers would never expire otherwise.
  s.flow.modifiers = s.flow.modifiers.filter((m) => m.drawnBy !== playerId);

  emit(c, { type: 'bankrupt', player: playerId, creditor: heir, cash, properties: owned.length });
  s.flow.notices.push({ kind: 'bankruptcy', player: playerId, creditor: heir });

  if (s.meta.settings.mode === 'quick') {
    endGame(c, 'bankruptcy');
    return;
  }
  if (livingPlayers(s).length <= 1) {
    endGame(c, 'lastPlayer');
    return;
  }
  if (playerId === s.turn.currentPlayerIndex) s.flow.resume = { kind: 'passTurn' };
}

/** Building value counted when a hotel city is liquidated, for tests and the UI. */
export function liquidationValue(space: number, level: number): number {
  let total = 0;
  for (let l = level; l > 0; l--) total += sellRefund(space, l);
  return total;
}
