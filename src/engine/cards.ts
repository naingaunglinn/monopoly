// Chance and Event cards (spec section 6): draw the top card, apply it, discard it; an empty deck
// reshuffles its discard pile. Held cards (Jail card, Free House) leave the deck until used.
import { BALANCE, BOARD_SIZE } from '../data/balance.js';
import { AIRPORT_SPACES, cardFits, COMPANIES, COMPANY_SPACES, COUNTRY_CITIES, LAYOUT, SPACES } from '../data/board.js';
import type { AssetKind, CardData, DeckId, MoveTarget } from '../data/cardTypes.js';
import { CHANCE_CARDS } from '../data/chance.js';
import { EVENT_CARDS } from '../data/events.js';
import {
  type Ctx,
  airportsOwnedBy,
  buildingCounts,
  changeCash,
  citiesOwnedBy,
  companiesOwnedBy,
  currentPlayer,
  emit,
  playersInTurnOrderFrom,
} from './core.js';
import { queueDebt, settleDebts } from './debt.js';
import { afterResolution, moveSteps, sendToJail, startVacation, teleport } from './phases.js';
import { shuffleInPlace } from './rng.js';
import type { Decks, GameState, Settings } from './types.js';

export const ALL_CARDS: readonly CardData[] = [...CHANCE_CARDS, ...EVENT_CARDS];
const CARD_BY_ID: ReadonlyMap<string, CardData> = new Map(ALL_CARDS.map((card) => [card.id, card]));

export function cardById(id: string): CardData {
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error(`Unknown card ${id}`);
  return card;
}

export function isKnownCard(id: string): boolean {
  return CARD_BY_ID.has(id);
}

/** The cards that fit the board in play: on a small board, the cards about a missing company go. */
const ON_BOARD: Readonly<Record<DeckId, readonly CardData[]>> = {
  chance: CHANCE_CARDS.filter((card) => cardFits(card, LAYOUT)),
  event: EVENT_CARDS.filter((card) => cardFits(card, LAYOUT)),
};

/** Cards in play for these settings: Go to Vacation cards are removed when Vacation is off. */
export function cardsForSettings(deck: DeckId, settings: Settings): CardData[] {
  return ON_BOARD[deck].filter((card) => settings.vacation || card.effect.type !== 'goToVacation');
}

/** Builds both decks and shuffles them with the game's generator (draft state). */
export function buildDecks(s: GameState): Decks {
  return {
    chanceDeck: shuffleInPlace(s, cardsForSettings('chance', s.meta.settings).map((c) => c.id)),
    chanceDiscard: [],
    eventDeck: shuffleInPlace(s, cardsForSettings('event', s.meta.settings).map((c) => c.id)),
    eventDiscard: [],
  };
}

export function discardCard(s: GameState, cardId: string): void {
  const card = cardById(cardId);
  if (card.deck === 'chance') s.decks.chanceDiscard.push(cardId);
  else s.decks.eventDiscard.push(cardId);
}

function takeTopCard(c: Ctx, deck: DeckId): string | null {
  const s = c.s;
  const pile = deck === 'chance' ? s.decks.chanceDeck : s.decks.eventDeck;
  const discard = deck === 'chance' ? s.decks.chanceDiscard : s.decks.eventDiscard;
  const forced = s.meta.forcedCards[deck];
  if (forced !== null) {
    s.meta.forcedCards[deck] = null;
    const inPile = pile.indexOf(forced);
    if (inPile >= 0) return pile.splice(inPile, 1)[0] as string;
    const inDiscard = discard.indexOf(forced);
    if (inDiscard >= 0) return discard.splice(inDiscard, 1)[0] as string;
    // Held by a player or not in this game: draw normally.
  }
  if (pile.length === 0) {
    if (discard.length === 0) return null;
    pile.push(...shuffleInPlace(s, discard.splice(0, discard.length)));
    emit(c, { type: 'deckShuffled', deck });
  }
  return pile.shift() ?? null;
}

/** Landing on Chance or Event: draw the top card and show it (CardReveal). */
export function drawCard(c: Ctx, deck: DeckId): void {
  const s = c.s;
  const cardId = takeTopCard(c, deck);
  if (cardId === null) {
    afterResolution(c);
    return;
  }
  s.flow.phase = 'CardReveal';
  s.flow.pending = { kind: 'card', deck, cardId };
  emit(c, { type: 'cardDrawn', player: s.turn.currentPlayerIndex, deck, cardId });
}

/** "Nearest" means the next one clockwise from the player. */
export function nearestAfter(position: number, spaces: readonly number[]): number {
  for (let k = 1; k <= BOARD_SIZE; k++) {
    const idx = (position + k) % BOARD_SIZE;
    if (spaces.includes(idx)) return idx;
  }
  throw new Error('No target space');
}

export function moveTargetSpace(position: number, target: MoveTarget): number {
  switch (target.kind) {
    case 'nearestAirport':
      return nearestAfter(position, AIRPORT_SPACES);
    case 'nearestCompany':
      return nearestAfter(position, COMPANY_SPACES);
    case 'country':
      return COUNTRY_CITIES[target.country][0] as number;
    case 'space':
      return target.index;
  }
}

function assetCount(s: GameState, playerId: number, kind: AssetKind): number {
  if (kind === 'airport') return airportsOwnedBy(s, playerId);
  if (kind === 'company') return companiesOwnedBy(s, playerId);
  return citiesOwnedBy(s, playerId);
}

/** OK on the card panel: apply the effect, then resolve any payments and continue. */
export function applyCard(c: Ctx, cardId: string): void {
  const s = c.s;
  const p = currentPlayer(s);
  const card = cardById(cardId);
  const effect = card.effect;
  s.flow.pending = null;
  const kept = effect.type === 'freeHouseVoucher' || effect.type === 'getOutOfJail';
  if (!kept) discardCard(s, cardId);
  const cash = (playerId: number, amount: number) => {
    changeCash(c, playerId, amount, 'card', { cardId });
    emit(c, { type: 'cardCash', player: playerId, amount, cardId });
  };
  const owe = (debtor: number, creditor: number | null, amount: number) =>
    queueDebt(c, { debtor, creditor, amount, reason: { kind: 'card', cardId } });

  switch (effect.type) {
    case 'cash':
      if (effect.amount >= 0) cash(p.id, effect.amount);
      else owe(p.id, null, -effect.amount);
      break;
    case 'allPlayersCash':
      for (const q of playersInTurnOrderFrom(s, p.id)) {
        if (effect.amount >= 0) cash(q.id, effect.amount);
        else owe(q.id, null, -effect.amount);
      }
      break;
    case 'cashPerPlayer': {
      // Paid in turn order, starting with the player after the drawer.
      const others = playersInTurnOrderFrom(s, p.id).filter((q) => q.id !== p.id);
      for (const q of others) {
        if (effect.amount >= 0) owe(q.id, p.id, effect.amount);
        else owe(p.id, q.id, -effect.amount);
      }
      break;
    }
    case 'move':
      moveSteps(c, p.id, effect.steps, 'card');
      return;
    case 'moveTo': {
      const target = moveTargetSpace(p.position, effect.target);
      const steps = (target - p.position + BOARD_SIZE) % BOARD_SIZE;
      if (steps === 0) break;
      moveSteps(c, p.id, steps, 'card');
      return;
    }
    case 'goToJail':
      sendToJail(c, 'card');
      return;
    case 'goToVacation':
      // Straight to Vacation like Jail: no World Start money. The turn otherwise continues.
      teleport(c, p.id, SPACES.vacation, 'vacation');
      s.turn.landedCity = null;
      startVacation(c, p.id);
      break;
    case 'rollAgain':
      s.turn.rollsLeft += 1;
      emit(c, { type: 'rollAgainGranted', player: p.id });
      break;
    case 'freeStay':
      if (s.meta.settings.freeStay && p.freeStay < BALANCE.freeStayMax) {
        p.freeStay += 1;
        emit(c, { type: 'freeStayGained', player: p.id, tokens: p.freeStay });
      } else {
        cash(p.id, BALANCE.freeStayOverflowCash);
      }
      break;
    case 'freeHouseVoucher':
      p.houseVouchers.push(cardId);
      emit(c, { type: 'cardKept', player: p.id, cardId });
      break;
    case 'getOutOfJail':
      p.jailCards.push(cardId);
      emit(c, { type: 'cardKept', player: p.id, cardId });
      break;
    case 'perBuildingFee': {
      const { houses, hotels } = buildingCounts(s, p.id);
      const fee = Math.min(BALANCE.cardCashLimit, houses * effect.house + hotels * effect.hotel);
      if (fee > 0) owe(p.id, null, fee);
      else emit(c, { type: 'cardNoEffect', player: p.id, cardId });
      break;
    }
    case 'companyOwnerCash': {
      const space = COMPANIES.find((co) => co.id === effect.company)?.space as number;
      const owner = s.properties[space]?.owner ?? null;
      if (owner === null) emit(c, { type: 'cardNoEffect', player: p.id, cardId });
      else if (effect.amount >= 0) cash(owner, effect.amount);
      else owe(owner, null, -effect.amount);
      break;
    }
    case 'perAssetCash': {
      let anyone = false;
      for (const q of playersInTurnOrderFrom(s, p.id)) {
        const amount = Math.min(BALANCE.perAssetCashCap, Math.abs(effect.amount) * assetCount(s, q.id, effect.kind));
        if (amount === 0) continue;
        anyone = true;
        if (effect.amount > 0) cash(q.id, amount);
        else owe(q.id, null, amount);
      }
      if (!anyone) emit(c, { type: 'cardNoEffect', player: p.id, cardId });
      break;
    }
    case 'modifier': {
      // Only one modifier per type is active; a new one replaces the old.
      const replaced = s.flow.modifiers.filter((m) => m.type === effect.modifier);
      s.flow.modifiers = s.flow.modifiers.filter((m) => m.type !== effect.modifier);
      for (const modifier of replaced) emit(c, { type: 'modifierEnded', modifier });
      const modifier = { type: effect.modifier, factor: effect.factor, cardId, drawnBy: p.id };
      s.flow.modifiers.push(modifier);
      emit(c, { type: 'modifierStarted', modifier });
      break;
    }
  }
  s.flow.resume = { kind: 'afterResolution' };
  settleDebts(c);
}
