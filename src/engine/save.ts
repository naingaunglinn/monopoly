// Save and resume (spec section 9). The save is the game state as JSON with a schemaVersion.
// A corrupt, older or newer save, or one from another board, is reported, never thrown. Version 1
// saves (before players chose their colours), version 2 saves (before the board size was a
// setting, all on the full 80-space board), version 3 saves (before the Myanmar map, all on the
// World map) and version 4 saves (before the Myanmar map's spec v2) are migrated on load.
import { MYANMAR, SETUP } from '../data/balance.js';
import { isProperty, LAYOUT, MAP, mapIdOf, useMap } from '../data/board.js';
import { MYANMAR_COMPANIES } from '../data/myanmar.js';
import { cardsForSettings, isKnownCard } from './cards.js';
import { checkInvariants } from './invariants.js';
import { SCHEMA_VERSION, isThisBoard, normalizeSettings } from './state.js';
import { PHASES, type GameState, type Settings } from './types.js';

export const SAVE_KEY = 'global-monopoly/save/v1';

export type SaveProblem = 'corrupt' | 'older' | 'newer' | 'otherBoard';
export type ParseResult = { ok: true; state: GameState } | { ok: false; problem: SaveProblem };

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isIntOrNull = (v: unknown) => v === null || isInt(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isCardList = (v: unknown) => isStrArray(v) && v.every(isKnownCard);

const DRAFT_STATUSES: readonly string[] = ['hiding', 'serving', 'fled', 'called'];

function economyIsValid(economy: unknown): boolean {
  if (!isObj(economy) || !isInt(economy.pot) || !isInt(economy.inflation) || !isInt(economy.loanSeq)) return false;
  if (!(economy.general === null || isInt(economy.general)) || !(economy.powerRound === null || isInt(economy.powerRound))) return false;
  if (!isInt(economy.unrestUsed) || !isInt(economy.rankSeq) || !Array.isArray(economy.bribed) || !economy.bribed.every(isInt)) return false;
  return (
    Array.isArray(economy.loans) &&
    economy.loans.every(
      (l) =>
        isObj(l) &&
        [l.id, l.lender, l.borrower, l.principal, l.ratePercent, l.term, l.startRound, l.repaid].every(isInt) &&
        Array.isArray(l.collateral) &&
        l.collateral.every(isInt),
    )
  );
}

function shapeIsValid(raw: Record<string, unknown>): boolean {
  const { players, properties, decks, turn, flow, meta } = raw;
  if (!economyIsValid(raw.economy)) return false;
  if (!Array.isArray(players) || !SETUP.playerCounts.includes(players.length)) return false;
  const playersOk = players.every(
    (p, i) =>
      isObj(p) &&
      p.id === i &&
      typeof p.name === 'string' &&
      typeof p.color === 'string' &&
      typeof p.token === 'string' &&
      isInt(p.cash) &&
      isInt(p.position) &&
      isInt(p.freeStay) &&
      typeof p.inJail === 'boolean' &&
      isInt(p.jailAttempts) &&
      typeof p.skipNextTurn === 'boolean' &&
      isCardList(p.jailCards) &&
      isCardList(p.houseVouchers) &&
      typeof p.bankrupt === 'boolean' &&
      isIntOrNull(p.bankruptOrder) &&
      Array.isArray(p.recap) &&
      isInt(p.merit) &&
      isInt(p.rank) &&
      isInt(p.rankAt) &&
      isInt(p.unrest) &&
      (p.draft === null || (isObj(p.draft) && DRAFT_STATUSES.includes(p.draft.status as string) && isInt(p.draft.turns))),
  );
  if (!playersOk) return false;
  if (!Array.isArray(properties) || properties.length !== LAYOUT.size) return false;
  const propsOk = properties.every((ps, i) =>
    isProperty(i)
      ? isObj(ps) && isIntOrNull(ps.owner) && isInt(ps.level) && typeof ps.mortgaged === 'boolean'
      : ps === null,
  );
  if (!propsOk) return false;
  if (
    !isObj(decks) ||
    !isCardList(decks.chanceDeck) ||
    !isCardList(decks.chanceDiscard) ||
    !isCardList(decks.eventDeck) ||
    !isCardList(decks.eventDiscard)
  ) {
    return false;
  }
  if (
    !isObj(turn) ||
    !isInt(turn.currentPlayerIndex) ||
    turn.currentPlayerIndex < 0 ||
    turn.currentPlayerIndex >= players.length ||
    !isInt(turn.doublesCount) ||
    !isIntOrNull(turn.landedCity) ||
    !isInt(turn.turnNumber) ||
    !isInt(turn.roundNumber) ||
    !isInt(turn.roundStartSeat) ||
    !isInt(turn.rollsLeft) ||
    !(turn.dice === null || (Array.isArray(turn.dice) && turn.dice.length === 2 && turn.dice.every(isInt))) ||
    !Array.isArray(turn.recap)
  ) {
    return false;
  }
  if (
    !isObj(flow) ||
    typeof flow.phase !== 'string' ||
    !(PHASES as readonly string[]).includes(flow.phase) ||
    !(flow.pending === null || isObj(flow.pending)) ||
    !(flow.trade === null || isObj(flow.trade)) ||
    !(flow.loan === null || isObj(flow.loan)) ||
    !Array.isArray(flow.notices) ||
    !Array.isArray(flow.debts) ||
    !(flow.resume === null || isObj(flow.resume)) ||
    !Array.isArray(flow.modifiers)
  ) {
    return false;
  }
  if (
    !isObj(meta) ||
    !isObj(meta.settings) ||
    !isInt(meta.rngState) ||
    !isInt(meta.seed) ||
    !Array.isArray(meta.log) ||
    !isInt(meta.logSeq) ||
    !Array.isArray(meta.forcedDice) ||
    !isObj(meta.forcedCards) ||
    !isObj(meta.stats) ||
    !(meta.winner === null || Array.isArray(meta.winner))
  ) {
    return false;
  }
  const settings = meta.settings as unknown as GameState['meta']['settings'];
  const normalized = normalizeSettings(settings);
  if (JSON.stringify(normalized) !== JSON.stringify(settings) || normalized.playerCount !== players.length) return false;
  // Each player has the colour chosen for their seat.
  return players.every((p, i) => (p as Record<string, unknown>).color === normalized.playerColors[i]);
}

/** Oldest save version that can still be loaded. */
const OLDEST_LOADABLE = 1;

/**
 * Version 1 to 2: the settings gain playerColors, taken from the players' own colours (in a
 * version 1 game these are the seat colours). Returns null when the version 1 settings are not
 * exactly what that version wrote.
 */
function migrateV1(raw: Record<string, unknown>): Record<string, unknown> | null {
  const { meta, players } = raw;
  if (!isObj(meta) || !isObj(meta.settings) || !Array.isArray(players)) return null;
  const v1 = meta.settings;
  const expected: Record<string, unknown> = { ...normalizeSettings(v1 as Partial<Settings>) };
  delete expected.playerColors;
  delete expected.board;
  delete expected.map;
  delete expected.general;
  if (JSON.stringify(expected) !== JSON.stringify(v1)) return null;
  const playerColors = players.map((p) => (isObj(p) ? p.color : null)) as string[];
  const settings: Record<string, unknown> = { ...normalizeSettings({ ...(v1 as Partial<Settings>), playerColors }) };
  delete settings.board;
  delete settings.map;
  delete settings.general;
  return { ...raw, meta: { ...meta, schemaVersion: 2, settings } };
}

/** The board of every save before version 3. */
const FULL_BOARD = { spaces: 80, shape: 'rectangle' } as const;

/** Version 2 to 3: the settings gain the board, which was always the full 80-space board. */
function migrateV2(raw: Record<string, unknown>): Record<string, unknown> | null {
  const { meta } = raw;
  if (!isObj(meta) || !isObj(meta.settings) || 'board' in meta.settings) return null;
  return { ...raw, meta: { ...meta, schemaVersion: 3, settings: { ...meta.settings, board: { ...FULL_BOARD } } } };
}

/**
 * Version 3 to 4: every game before version 4 was on the World map. Players gain merit (0) and
 * military service (none), the flow a loan offer slot (empty), the game an economy (empty).
 */
function migrateV3(raw: Record<string, unknown>): Record<string, unknown> | null {
  const { meta, players, flow } = raw;
  if (!isObj(meta) || !isObj(meta.settings) || 'map' in meta.settings || !Array.isArray(players) || !isObj(flow) || 'economy' in raw) {
    return null;
  }
  return {
    ...raw,
    players: players.map((p) => (isObj(p) ? { ...p, merit: 0, draft: null } : p)),
    flow: { ...flow, loan: null },
    meta: { ...meta, schemaVersion: 4, settings: { ...meta.settings, map: 'world' } },
    economy: { pot: 0, inflation: 0, loans: [], loanSeq: 0 },
  };
}

/**
 * Version 4 to 5 (the Myanmar map's spec v2): players gain a rank (0) and their unrest cups, the
 * economy a general (none). On the Myanmar map the Special tax space becomes the Brycen Myanmar
 * company (unowned), and the new cards go to the bottom of their draw piles (D106).
 */
function migrateV4(raw: Record<string, unknown>): Record<string, unknown> | null {
  const { meta, players, economy, properties, decks, flow } = raw;
  if (!isObj(meta) || !isObj(meta.settings) || !Array.isArray(players) || !isObj(economy) || 'general' in economy) return null;
  if (!Array.isArray(properties) || !isObj(decks) || !isObj(flow)) return null;
  const out: Record<string, unknown> = {
    ...raw,
    players: players.map((p) => (isObj(p) ? { ...p, rank: 0, rankAt: 0, unrest: MYANMAR.unrestCups } : p)),
    economy: { ...economy, general: null, powerRound: null, unrestUsed: 0, bribed: [], rankSeq: 0 },
    meta: { ...meta, schemaVersion: 5 },
  };
  if (meta.settings.map !== 'myanmar') return out;
  const brycen = MYANMAR_COMPANIES.find((c) => c.id === 'brycen')?.space;
  const props = properties.slice();
  if (brycen !== undefined && props[brycen] === null) props[brycen] = { owner: null, level: 0, mortgaged: false };
  out.properties = props;
  const held = players.flatMap((p) => (isObj(p) ? [...((p.jailCards as string[]) ?? []), ...((p.houseVouchers as string[]) ?? [])] : []));
  const pending = isObj(flow.pending) && flow.pending.kind === 'card' ? [flow.pending.cardId as string] : [];
  const nextDecks: Record<string, unknown> = { ...decks };
  for (const [deck, pile, discard] of [
    ['chance', 'chanceDeck', 'chanceDiscard'],
    ['event', 'eventDeck', 'eventDiscard'],
  ] as const) {
    const draw = Array.isArray(decks[pile]) ? [...(decks[pile] as string[])] : [];
    const seen = new Set([...draw, ...(Array.isArray(decks[discard]) ? (decks[discard] as string[]) : []), ...held, ...pending]);
    for (const card of cardsForSettings(deck, meta.settings as unknown as Settings)) if (!seen.has(card.id)) draw.push(card.id);
    nextDecks[pile] = draw;
  }
  out.decks = nextDecks;
  return out;
}

/**
 * Version 5 to 6: the settings gain the general house rule, on as before (D115). An unrest window
 * that is open keeps its target; the money it takes follows the new rule.
 */
function migrateV5(raw: Record<string, unknown>): Record<string, unknown> | null {
  const { meta } = raw;
  if (!isObj(meta) || !isObj(meta.settings) || 'general' in meta.settings) return null;
  return { ...raw, meta: { ...meta, schemaVersion: 6, settings: { ...meta.settings, general: true } } };
}

/**
 * Brings a game the server kept (an online room started before this version) up to the current
 * version, without checking it again: the server wrote it. Null when it cannot be migrated.
 */
export function upgradeGame<T>(game: T): T | null {
  const raw = game as unknown as Record<string, unknown>;
  if (!isObj(raw) || !isObj(raw.meta)) return null;
  const version = raw.meta.schemaVersion;
  if (!isInt(version) || version > SCHEMA_VERSION) return null;
  if (version === SCHEMA_VERSION) return game;
  let current: Record<string, unknown> | null = raw;
  if (current && version <= 1) current = migrateV1(current);
  if (current && version <= 2) current = migrateV2(current);
  if (current && version <= 3) current = migrateV3(current);
  if (current && version <= 4) current = migrateV4(current);
  if (current && version <= 5) current = migrateV5(current);
  return current as unknown as T | null;
}

export function parseSave(text: string | null | undefined): ParseResult {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, problem: 'corrupt' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'corrupt' };
  }
  if (!isObj(raw) || !isObj(raw.meta)) return { ok: false, problem: 'corrupt' };
  const version = raw.meta.schemaVersion;
  if (!isInt(version)) return { ok: false, problem: 'older' };
  if (version < OLDEST_LOADABLE) return { ok: false, problem: 'older' };
  if (version > SCHEMA_VERSION) return { ok: false, problem: 'newer' };
  // Checking a save reads its map's board; the map in play is put back afterwards, so reading a save
  // (the start screen looks for one) never changes the board on screen.
  const mapBefore = MAP.id;
  try {
    let current: Record<string, unknown> | null = raw;
    if (current && version <= 1) current = migrateV1(current);
    if (current && version <= 2) current = migrateV2(current);
    if (current && version <= 3) current = migrateV3(current);
    if (current && version <= 4) current = migrateV4(current);
    if (current && version <= 5) current = migrateV5(current);
    if (!current) return { ok: false, problem: 'corrupt' };
    // A game from another board cannot go on: its spaces are not this board's (D96).
    const settings = (current.meta as Record<string, unknown>).settings;
    if (!isObj(settings) || !isThisBoard(settings)) return { ok: false, problem: 'otherBoard' };
    useMap({ map: mapIdOf(settings.map) });
    if (!shapeIsValid(current)) return { ok: false, problem: 'corrupt' };
    const state = current as unknown as GameState;
    if (checkInvariants(state).length > 0) return { ok: false, problem: 'corrupt' };
    return { ok: true, state };
  } catch {
    return { ok: false, problem: 'corrupt' };
  } finally {
    useMap({ map: mapBefore });
  }
}
