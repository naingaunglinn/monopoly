// The Myanmar map's own rules, stage 2 (owner's spec 7.1 to 7.4, D102): military service instead
// of Jail, merit from the pagodas, the four company events and inflation. Nothing here runs on the
// World map: every entry point is reached only when the map in play has the rule (RULES).
import { MYANMAR, roundMoney } from '../data/balance.js';
import { COMPANIES, RULES, SPACES } from '../data/board.js';
import type { CompanyId } from '../data/companies.js';
import { MYANMAR_TRANSPORT } from '../data/myanmar.js';
import { addModifier, cardById, discardCard } from './cards.js';
import { changeCash, currentPlayer, emit, livingPlayers, playerById, type Ctx } from './core.js';
import { queueDebt, settleDebts } from './debt.js';
import { afterResolution, passTurn, teleport } from './phases.js';
import type { DraftChoice, GameState, Player } from './types.js';

/** Paying to stay out of service costs a tenth of the player's cash, and at least 500 lakh. */
export function draftPayCost(cash: number): number {
  return Math.max(MYANMAR.draftPayMin, roundMoney((cash * MYANMAR.draftPayPercent) / 100));
}

/** The space a player who flees runs to: the Muse Border Gate. */
export function borderSpace(): number {
  return MYANMAR_TRANSPORT.find((t) => t.kind === 'border')?.space ?? SPACES.jail;
}

/** Hiding or serving: no turns and no rent. A player who fled still collects rent. */
export function inService(p: Player): boolean {
  return p.draft !== null && p.draft.status !== 'fled';
}

/** The owner of a company on the map in play, or null. */
export function companyOwner(s: GameState, company: CompanyId): number | null {
  const space = COMPANIES.find((c) => c.id === company)?.space;
  return space === undefined ? null : (s.properties[space]?.owner ?? null);
}

/** City rent rises with inflation, except for the owner of KBZ Bank (spec 7.3, 7.4). Null: no change. */
export function inflationFactor(s: GameState, payer: number | null): number | null {
  if (!RULES.inflation || s.economy.inflation === 0) return null;
  if (payer !== null && companyOwner(s, 'kbz') === payer) return null;
  return (100 + s.economy.inflation) / 100;
}

/** Called up (Call-up letter, the card, three doubles): to the Military camp, then a choice. */
export function callUp(c: Ctx, reason: 'space' | 'card' | 'doubles'): void {
  const s = c.s;
  const p = currentPlayer(s);
  teleport(c, p.id, SPACES.jail, 'jail');
  // A skip from a fuel shortage is not kept on top of military service.
  p.skipNextTurn = false;
  s.turn.rollsLeft = 0;
  s.turn.landedCity = null;
  emit(c, { type: 'jailed', player: p.id, reason });
  s.flow.phase = 'TurnStart';
  s.flow.pending = { kind: 'draftChoice' };
}

/** Why a way out of service cannot be taken now, or null. */
export function draftChoiceBlocker(p: Player, how: DraftChoice): 'cash' | 'merit' | 'card' | null {
  switch (how) {
    case 'pay':
      return p.cash >= draftPayCost(p.cash) ? null : 'cash';
    case 'flee':
      return p.cash >= MYANMAR.draftFleeCost ? null : 'cash';
    case 'merit':
      return p.merit > 0 ? null : 'merit';
    case 'card':
      return p.jailCards.length > 0 ? null : 'card';
    default:
      return null;
  }
}

/** The called-up player's choice (spec 7.1). Then the turn ends. */
export function chooseDraft(c: Ctx, how: DraftChoice): void {
  const s = c.s;
  const p = currentPlayer(s);
  let cost = 0;
  switch (how) {
    case 'pay':
      cost = draftPayCost(p.cash);
      changeCash(c, p.id, -cost, 'draft');
      break;
    case 'hide':
      p.draft = { status: 'hiding', turns: MYANMAR.draftHideTurns };
      break;
    case 'serve':
      p.draft = { status: 'serving', turns: MYANMAR.draftServeTurns };
      break;
    case 'flee':
      cost = MYANMAR.draftFleeCost;
      changeCash(c, p.id, -cost, 'draft');
      // Straight to the border: no landing there and no Start money on the way.
      teleport(c, p.id, borderSpace(), 'flee');
      p.draft = { status: 'fled', turns: MYANMAR.draftFleeTurns };
      break;
    case 'merit':
      p.merit -= 1;
      break;
    case 'card':
      discardCard(s, p.jailCards.shift() as string);
      break;
  }
  emit(c, { type: 'draftChosen', player: p.id, how, cost });
  s.flow.phase = 'AwaitEndTurn';
  s.flow.pending = null;
}

/** A turn in service is skipped; after the last one the player is free (serving pays 300 lakh). */
export function skipDraftTurn(c: Ctx): void {
  const s = c.s;
  const p = currentPlayer(s);
  const draft = p.draft;
  emit(c, { type: 'turnSkipped', player: p.id });
  if (draft) {
    draft.turns -= 1;
    if (draft.turns <= 0) {
      const bonus = draft.status === 'serving' ? MYANMAR.draftServeBonus : 0;
      p.draft = null;
      if (bonus > 0) changeCash(c, p.id, bonus, 'draft');
      emit(c, { type: 'draftEnded', player: p.id, how: 'done', bonus });
    }
  }
  s.flow.pending = null;
  passTurn(c);
}

/** Out of service at once with a merit point or the Call-up exemption card; this turn is played. */
export function leaveDraft(c: Ctx, how: 'merit' | 'card'): void {
  const s = c.s;
  const p = currentPlayer(s);
  if (how === 'merit') p.merit -= 1;
  else discardCard(s, p.jailCards.shift() as string);
  p.draft = null;
  emit(c, { type: 'draftEnded', player: p.id, how, bonus: 0 });
  s.flow.phase = 'AwaitRoll';
  s.flow.pending = null;
}

/** Landing on a pagoda: a donation is offered while the player can afford it and has room for merit. */
export function offerDonation(c: Ctx, space: number): boolean {
  const s = c.s;
  const p = currentPlayer(s);
  if (!RULES.merit || p.merit >= MYANMAR.meritMax || p.cash < MYANMAR.meritDonation) return false;
  s.flow.phase = 'BuyDecision';
  s.flow.pending = { kind: 'donation', space };
  return true;
}

export function donate(c: Ctx, give: boolean): void {
  const s = c.s;
  const p = currentPlayer(s);
  if (give) {
    changeCash(c, p.id, -MYANMAR.meritDonation, 'merit');
    p.merit += 1;
    emit(c, { type: 'meritGained', player: p.id, merit: p.merit });
  }
  s.flow.pending = null;
  afterResolution(c);
}

/** True when the card on the table is a bad Chance card, which a merit point can cancel. */
export function cancellableCard(cardId: string): boolean {
  const card = cardById(cardId);
  return card.deck === 'chance' && card.tone === 'bad';
}

/** A merit point skips this rent, or cancels this bad Chance card (spec 7.2). */
export function useMerit(c: Ctx): void {
  const s = c.s;
  const pending = s.flow.pending;
  const p = currentPlayer(s);
  if (pending?.kind === 'rent') {
    const payer = playerById(s, pending.rent.payer);
    payer.merit -= 1;
    emit(c, {
      type: 'rentWaived',
      player: payer.id,
      space: pending.rent.space,
      owner: pending.rent.creditor as number,
      amount: pending.rent.amount,
      why: 'merit',
    });
    s.flow.pending = null;
    afterResolution(c);
    return;
  }
  if (pending?.kind === 'card') {
    p.merit -= 1;
    discardCard(s, pending.cardId);
    emit(c, { type: 'cardCancelled', player: p.id, cardId: pending.cardId });
    s.flow.pending = null;
    afterResolution(c);
  }
}

/** The broker card: paying keeps the player off the list. */
export function payBroker(c: Ctx, cardId: string, amount: number): void {
  const s = c.s;
  const p = currentPlayer(s);
  discardCard(s, cardId);
  s.flow.pending = null;
  changeCash(c, p.id, -amount, 'card', { cardId });
  emit(c, { type: 'cardCash', player: p.id, amount: -amount, cardId });
  afterResolution(c);
}

/** The Myanmar card effects of stage 2. Returns false when the effect is not one of them. */
export function applyMyanmarEffect(c: Ctx, cardId: string): boolean {
  const s = c.s;
  const p = currentPlayer(s);
  const effect = cardById(cardId).effect;
  switch (effect.type) {
    case 'broker':
      // Not paid (OK on the card): called up.
      callUp(c, 'card');
      return true;
    case 'meritFee':
      if (p.merit < MYANMAR.meritMax) {
        p.merit += 1;
        emit(c, { type: 'meritGained', player: p.id, merit: p.merit });
      }
      queueDebt(c, { debtor: p.id, creditor: null, amount: effect.amount, reason: { kind: 'card', cardId } });
      break;
    case 'blackout':
      addModifier(c, { type: 'cityRent', factor: effect.cityFactor, cardId, drawnBy: p.id });
      addModifier(c, { type: 'companyBoost', factor: effect.companyFactor, cardId, drawnBy: p.id });
      break;
    case 'noTrade':
      addModifier(c, { type: 'noTrade', factor: 1, cardId, drawnBy: p.id });
      break;
    case 'fuelShortage': {
      const exempt = companyOwner(s, effect.company);
      const players = livingPlayers(s).filter((q) => q.id !== exempt && q.draft === null);
      for (const q of players) q.skipNextTurn = true;
      emit(c, { type: 'fuelShortage', players: players.map((q) => q.id), cardId });
      break;
    }
    case 'inflation':
      s.economy.inflation += effect.step;
      emit(c, { type: 'inflationRose', rate: s.economy.inflation, by: 'card' });
      break;
    default:
      return false;
  }
  s.flow.resume = { kind: 'afterResolution' };
  settleDebts(c);
  return true;
}

/** After every five rounds city rents rise 10% (spec 7.4): at the start of rounds 6, 11, 16... */
export function roundInflation(c: Ctx): void {
  const s = c.s;
  if (!RULES.inflation || s.turn.roundNumber <= 1 || (s.turn.roundNumber - 1) % MYANMAR.inflationEvery !== 0) return;
  s.economy.inflation += MYANMAR.inflationStep;
  emit(c, { type: 'inflationRose', rate: s.economy.inflation, by: 'round' });
}

/** Internet cut: only the owner of the named company may offer trades (spec 7.3). */
export function tradeBlockedFor(s: GameState, player: number): boolean {
  const cut = s.flow.modifiers.find((m) => m.type === 'noTrade');
  if (!cut) return false;
  const effect = cardById(cut.cardId).effect;
  return effect.type !== 'noTrade' || companyOwner(s, effect.company) !== player;
}

/** The company a companyBoost modifier names. */
export function boostedCompany(cardId: string): CompanyId | null {
  const effect = cardById(cardId).effect;
  return effect.type === 'blackout' ? effect.company : null;
}
