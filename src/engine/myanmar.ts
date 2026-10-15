// The Myanmar map's own rules (owner's spec section 7). Stage 2 (D102): military service instead of
// Jail, merit from the pagodas, the four company events and inflation. Stage 3 (D103): the
// earthquake, tolls, the lottery, the community pot and remittance. Nothing here runs on the World
// map: every entry point is reached only when the map in play has the rule (RULES).
import { MYANMAR, roundMoney } from '../data/balance.js';
import { AIRPORT_BY_SPACE, COMPANIES, COUNTRY_CITIES, RULES, SPACES } from '../data/board.js';
import type { CompanyId } from '../data/companies.js';
import { addModifier, cardById, discardCard } from './cards.js';
import { changeCash, currentPlayer, emit, livingPlayers, playerById, playersInTurnOrderFrom, type Ctx } from './core.js';
import { queueDebt, settleDebts } from './debt.js';
import { promote } from './general.js';
import { afterResolution, passTurn, rollDice, teleport } from './phases.js';
import { randomInt, rollDie } from './rng.js';
import type { DraftChoice, GameState, Player } from './types.js';

/** Paying to stay out of service costs a tenth of the player's cash, and at least 500 lakh. */
export function draftPayCost(cash: number): number {
  return Math.max(MYANMAR.draftPayMin, roundMoney((cash * MYANMAR.draftPayPercent) / 100));
}

/** The space a player who flees runs to: the Chiang Mai corner (spec v2, D106). */
export function fleeSpace(): number {
  return SPACES.vacation;
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
  // Called up by the Porters news on someone else's turn, the player chooses at their turn start
  // (no dice yet this turn): going free lets them play the turn; hiding, serving or fleeing counts
  // it as the first turn skipped, as if called up on their own move (D106).
  const atTurnStart = s.turn.dice === null;
  if (p.draft?.status === 'called') p.draft = null;
  let cost = 0;
  switch (how) {
    case 'pay':
      cost = draftPayCost(p.cash);
      changeCash(c, p.id, -cost, 'draft');
      toPot(c, p.id, cost);
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
      toPot(c, p.id, cost);
      // Straight to Chiang Mai: no landing there (so not the pot) and no Start money on the way.
      teleport(c, p.id, fleeSpace(), 'flee');
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
  s.flow.pending = null;
  if (atTurnStart) {
    if (p.draft) {
      skipDraftTurn(c);
      return;
    }
    s.flow.phase = 'AwaitRoll';
    return;
  }
  s.flow.phase = 'AwaitEndTurn';
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
      const serving = draft.status === 'serving';
      const bonus = serving ? MYANMAR.draftServeBonus : 0;
      p.draft = null;
      if (bonus > 0) changeCash(c, p.id, bonus, 'draft');
      emit(c, { type: 'draftEnded', player: p.id, how: 'done', bonus });
      // Spec v2: serving also earns rank, and a salary for it (D107).
      if (serving && RULES.general) promote(c, p);
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
  // The porter card says no merit can help (spec v2, D106).
  return card.deck === 'chance' && card.tone === 'bad' && card.effect.type !== 'porter';
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
  toPot(c, p.id, amount);
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
    case 'lottery':
      // OK without buying: no ticket.
      break;
    case 'earthquake': {
      const forced = s.meta.forcedDice.shift();
      const die = forced ? forced[0] : rollDie(s);
      const region = die % 2 === 1 ? effect.odd : effect.even;
      const spaces = COUNTRY_CITIES[region].filter((sp) => (s.properties[sp]?.level ?? 0) > 0);
      for (const sp of spaces) (s.properties[sp] as { level: number }).level = 0;
      emit(c, { type: 'earthquake', die, region, spaces });
      break;
    }
    case 'potDonation':
      for (const q of livingPlayers(s)) queueDebt(c, { debtor: q.id, creditor: null, amount: effect.amount, reason: { kind: 'card', cardId } });
      break;
    case 'porter':
      // Spec v2 (D106): to the camp, and the one way out is paying (as a debt, so a player short of
      // cash raises it or goes bankrupt; never stuck). The fee goes into the pot. The turn ends.
      teleport(c, p.id, SPACES.jail, 'jail');
      s.turn.rollsLeft = 0;
      s.turn.landedCity = null;
      emit(c, { type: 'jailed', player: p.id, reason: 'card' });
      queueDebt(c, { debtor: p.id, creditor: null, amount: effect.amount, reason: { kind: 'card', cardId } });
      break;
    case 'companyRescue': {
      // Every player pays the owner (the owner, if it is the drawer, collects from the rest); with
      // no owner every player puts the money into the pot.
      const owner = companyOwner(s, effect.company);
      for (const q of playersInTurnOrderFrom(s, p.id)) {
        if (q.id === owner) continue;
        queueDebt(c, { debtor: q.id, creditor: owner, amount: effect.amount, reason: { kind: 'card', cardId } });
      }
      break;
    }
    case 'porterHunt': {
      const free = livingPlayers(s).filter((q) => q.draft === null);
      if (free.length === 0) {
        emit(c, { type: 'cardNoEffect', player: p.id, cardId });
        break;
      }
      const picked = free[randomInt(s, 0, free.length - 1)] as Player;
      if (picked.id === p.id) {
        // The drawer: called up now, like the conscription card.
        callUp(c, 'card');
        return true;
      }
      // Someone else: to the camp now; they choose at the start of their next turn.
      teleport(c, picked.id, SPACES.jail, 'jail');
      picked.skipNextTurn = false;
      picked.draft = { status: 'called', turns: 1 };
      emit(c, { type: 'jailed', player: picked.id, reason: 'card' });
      break;
    }
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

// ---------------------------------------------------------------------------------------------
// Stage 3 (D103)

/** Taxes and fines go into the community pot in the middle of the board (spec 7.9). */
export function toPot(c: Ctx, player: number, amount: number): void {
  if (!RULES.pot || amount <= 0) return;
  c.s.economy.pot += amount;
  emit(c, { type: 'potAdded', player, amount, pot: c.s.economy.pot });
}

/** Landing on the Refuge takes everything in the pot. */
export function takePot(c: Ctx): void {
  const s = c.s;
  if (!RULES.pot || s.economy.pot <= 0) return;
  const p = currentPlayer(s);
  const amount = s.economy.pot;
  s.economy.pot = 0;
  changeCash(c, p.id, amount, 'pot');
  emit(c, { type: 'potTaken', player: p.id, amount });
}

/**
 * Tolls on a move (spec 7.7): passing over, not landing on, the Expressway or the Muse Border Gate
 * costs 20 lakh for its owner: never when it has no owner, is the mover's own, is mortgaged, or its
 * owner is hiding or serving (they collect no rent then either).
 */
export function tollsOnPath(s: GameState, mover: number, path: readonly number[]): Array<{ space: number; owner: number }> {
  if (!RULES.tolls) return [];
  const out: Array<{ space: number; owner: number }> = [];
  for (const space of path.slice(0, -1)) {
    const transport = AIRPORT_BY_SPACE.get(space) as { toll?: boolean } | undefined;
    if (!transport?.toll) continue;
    const ps = s.properties[space];
    if (!ps || ps.owner === null || ps.owner === mover || ps.mortgaged) continue;
    const owner = s.players[ps.owner];
    if (!owner || owner.bankrupt || inService(owner)) continue;
    out.push({ space, owner: ps.owner });
  }
  return out;
}

/** The lottery card (spec 7.8): pay for a ticket, roll two dice, win by the total. */
export function buyTicket(c: Ctx, cardId: string, ticket: number): void {
  const s = c.s;
  const p = currentPlayer(s);
  discardCard(s, cardId);
  s.flow.pending = null;
  changeCash(c, p.id, -ticket, 'lottery');
  const dice = rollDice(c);
  const total = dice[0] + dice[1];
  emit(c, { type: 'diceRolled', player: p.id, dice, purpose: 'lottery', doubles: false });
  const prize = MYANMAR.lotteryPrizes.find((tier) => total >= tier.min)?.prize ?? 0;
  if (prize > 0) changeCash(c, p.id, prize, 'lottery');
  emit(c, { type: 'lotteryDrawn', player: p.id, dice, total, prize });
  afterResolution(c);
}

/** Each round a player who fled to the border receives money from home (spec 7.10). */
export function remittance(c: Ctx): void {
  if (!RULES.conscription) return;
  for (const p of livingPlayers(c.s)) {
    if (p.draft?.status !== 'fled') continue;
    changeCash(c, p.id, MYANMAR.remittance, 'remittance');
    emit(c, { type: 'remittance', player: p.id, amount: MYANMAR.remittance });
  }
}
