// Shared engine plumbing: the draft context, event emission, cash changes and board queries.
// Handlers receive a draft (a fresh clone) and mutate it; reduce() never mutates its input.
import { BALANCE } from '../data/balance';
import {
  AIRPORT_SPACES,
  BOARD,
  CITY_BY_SPACE,
  COMPANY_SPACES,
  COUNTRY_CITIES,
  propertyKind,
} from '../data/board';
import type { CountryId } from '../data/countries';
import { errorText } from '../ui/strings';
import type {
  EngineError,
  ErrorCode,
  ErrorParams,
  GameEvent,
  GameState,
  MoneyReason,
  Player,
  PropertyState,
} from './types';

export interface Ctx {
  s: GameState;
  events: GameEvent[];
}

/** Events that are animation detail only and never written to the log. */
const UNLOGGED: ReadonlySet<GameEvent['type']> = new Set(['money', 'landed', 'settingChanged']);

export function emit(c: Ctx, event: GameEvent): void {
  c.events.push(event);
  if (UNLOGGED.has(event.type)) return;
  const meta = c.s.meta;
  meta.logSeq += 1;
  meta.log.push({ seq: meta.logSeq, turn: c.s.turn.turnNumber, round: c.s.turn.roundNumber, event });
  if (meta.log.length > BALANCE.logLimit) meta.log.splice(0, meta.log.length - BALANCE.logLimit);
}

export function makeError(code: ErrorCode, params: ErrorParams = {}): EngineError {
  return { code, params, reason: errorText(code, params) };
}

// ---------------------------------------------------------------------------------------------
// Cloning: a hand-shaped deep copy (much faster than structuredClone for the simulation).

export function cloneState(s: GameState): GameState {
  return {
    players: s.players.map((p) => ({
      ...p,
      jailCards: p.jailCards.slice(),
      houseVouchers: p.houseVouchers.slice(),
      recap: p.recap.slice(),
    })),
    properties: s.properties.map((p) => (p ? { ...p } : null)),
    decks: {
      chanceDeck: s.decks.chanceDeck.slice(),
      chanceDiscard: s.decks.chanceDiscard.slice(),
      eventDeck: s.decks.eventDeck.slice(),
      eventDiscard: s.decks.eventDiscard.slice(),
    },
    turn: {
      ...s.turn,
      dice: s.turn.dice ? [s.turn.dice[0], s.turn.dice[1]] : null,
      recap: s.turn.recap.slice(),
    },
    flow: {
      phase: s.flow.phase,
      pending: s.flow.pending ? deepCopy(s.flow.pending) : null,
      trade: s.flow.trade ? deepCopy(s.flow.trade) : null,
      notices: s.flow.notices.map((n) => ({ ...n })),
      debts: s.flow.debts.map((d) => ({ ...d, reason: { ...d.reason } })),
      resume: s.flow.resume ? { ...s.flow.resume } : null,
      modifiers: s.flow.modifiers.map((mod) => ({ ...mod })),
    },
    meta: {
      ...s.meta,
      settings: { ...s.meta.settings, playerNames: s.meta.settings.playerNames.slice() },
      winner: s.meta.winner ? s.meta.winner.slice() : null,
      // Log entries are never mutated after creation, so sharing them is safe.
      log: s.meta.log.slice(),
      forcedDice: s.meta.forcedDice.map((d) => [d[0], d[1]]),
      forcedCards: { ...s.meta.forcedCards },
      stats: { ...s.meta.stats },
    },
  };
}

/** Deep copy for small plain-JSON values. */
export function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepCopy(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepCopy(v);
    return out as T;
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Queries

export function currentPlayer(s: GameState): Player {
  return s.players[s.turn.currentPlayerIndex] as Player;
}

export function playerById(s: GameState, id: number): Player {
  const p = s.players[id];
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

export function livingPlayers(s: GameState): Player[] {
  return s.players.filter((p) => !p.bankrupt);
}

/** Living players in turn order starting with `first` (inclusive). */
export function playersInTurnOrderFrom(s: GameState, first: number): Player[] {
  const n = s.players.length;
  const out: Player[] = [];
  for (let k = 0; k < n; k++) {
    const p = s.players[(first + k) % n] as Player;
    if (!p.bankrupt) out.push(p);
  }
  return out;
}

/** Next living seat after `seat` (clockwise), or null if nobody else is alive. */
export function nextLivingSeat(s: GameState, seat: number): number | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const idx = (seat + k) % n;
    if (!(s.players[idx] as Player).bankrupt && idx !== seat) return idx;
  }
  return null;
}

export function prop(s: GameState, space: number): PropertyState {
  const p = s.properties[space];
  if (!p) throw new Error(`Space ${space} is not a property`);
  return p;
}

export function countryOf(space: number): CountryId | null {
  return CITY_BY_SPACE.get(space)?.country ?? null;
}

/** True when one player owns every city of the country (mortgaged cities still count). */
export function ownsCountry(s: GameState, playerId: number, country: CountryId): boolean {
  return COUNTRY_CITIES[country].every((sp) => s.properties[sp]?.owner === playerId);
}

export function countryOwner(s: GameState, country: CountryId): number | null {
  const first = s.properties[COUNTRY_CITIES[country][0] as number]?.owner ?? null;
  if (first === null) return null;
  return ownsCountry(s, first, country) ? first : null;
}

export function countryLevels(s: GameState, country: CountryId): number[] {
  return COUNTRY_CITIES[country].map((sp) => s.properties[sp]?.level ?? 0);
}

export function countryHasBuildings(s: GameState, country: CountryId): boolean {
  return COUNTRY_CITIES[country].some((sp) => (s.properties[sp]?.level ?? 0) > 0);
}

export function firstMortgagedCity(s: GameState, country: CountryId): number | null {
  return COUNTRY_CITIES[country].find((sp) => s.properties[sp]?.mortgaged) ?? null;
}

export function airportsOwnedBy(s: GameState, playerId: number): number {
  return AIRPORT_SPACES.filter((sp) => s.properties[sp]?.owner === playerId).length;
}

export function companiesOwnedBy(s: GameState, playerId: number): number {
  return COMPANY_SPACES.filter((sp) => s.properties[sp]?.owner === playerId).length;
}

export function citiesOwnedBy(s: GameState, playerId: number): number {
  let n = 0;
  for (const space of CITY_BY_SPACE.keys()) if (s.properties[space]?.owner === playerId) n++;
  return n;
}

export function propertiesOwnedBy(s: GameState, playerId: number): number[] {
  const out: number[] = [];
  s.properties.forEach((p, i) => {
    if (p && p.owner === playerId) out.push(i);
  });
  return out;
}

export function buildingCounts(s: GameState, playerId: number): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const space of CITY_BY_SPACE.keys()) {
    const p = s.properties[space];
    if (!p || p.owner !== playerId) continue;
    if (p.level === BALANCE.hotelLevel) hotels++;
    else houses += p.level;
  }
  return { houses, hotels };
}

export function isPropertySpace(space: number): boolean {
  return propertyKind(space) !== null;
}

export function spaceType(space: number) {
  return BOARD[space]?.type ?? null;
}

// ---------------------------------------------------------------------------------------------
// Cash

/**
 * Changes a player's cash and emits a money event. Changes during another player's turn are
 * remembered for the recap line shown at the start of the player's next turn.
 */
export function changeCash(
  c: Ctx,
  playerId: number,
  delta: number,
  reason: MoneyReason,
  extra: { counterparty?: number | null; space?: number | null; cardId?: string | null } = {},
): void {
  if (delta === 0) return;
  const p = playerById(c.s, playerId);
  p.cash += delta;
  const counterparty = extra.counterparty ?? null;
  emit(c, { type: 'money', player: playerId, delta, reason, counterparty });
  if (playerId !== c.s.turn.currentPlayerIndex && !p.bankrupt) {
    p.recap.push({ delta, reason, counterparty, space: extra.space ?? null, cardId: extra.cardId ?? null });
  }
}

/** Moves cash between two players (or a player and the bank when one side is null). */
export function transfer(
  c: Ctx,
  from: number | null,
  to: number | null,
  amount: number,
  reason: MoneyReason,
  extra: { space?: number | null; cardId?: string | null } = {},
): void {
  if (amount <= 0) return;
  if (from !== null) changeCash(c, from, -amount, reason, { ...extra, counterparty: to });
  if (to !== null) changeCash(c, to, amount, reason, { ...extra, counterparty: from });
}
