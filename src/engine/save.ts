// Save and resume (spec section 9). The save is the game state as JSON with a schemaVersion.
// A corrupt, older or newer save is reported, never thrown. Version 1 saves (before players
// chose their colours) are migrated to version 2 on load.
import { BOARD_SIZE, SETUP } from '../data/balance.js';
import { isProperty } from '../data/board.js';
import { isKnownCard } from './cards.js';
import { checkInvariants } from './invariants.js';
import { SCHEMA_VERSION, normalizeSettings } from './state.js';
import { PHASES, type GameState, type Settings } from './types.js';

export const SAVE_KEY = 'global-monopoly/save/v1';

export type SaveProblem = 'corrupt' | 'older' | 'newer';
export type ParseResult = { ok: true; state: GameState } | { ok: false; problem: SaveProblem };

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isIntOrNull = (v: unknown) => v === null || isInt(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isCardList = (v: unknown) => isStrArray(v) && v.every(isKnownCard);

function shapeIsValid(raw: Record<string, unknown>): boolean {
  const { players, properties, decks, turn, flow, meta } = raw;
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
      Array.isArray(p.recap),
  );
  if (!playersOk) return false;
  if (!Array.isArray(properties) || properties.length !== BOARD_SIZE) return false;
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
  if (JSON.stringify(expected) !== JSON.stringify(v1)) return null;
  const playerColors = players.map((p) => (isObj(p) ? p.color : null)) as string[];
  const settings = normalizeSettings({ ...(v1 as Partial<Settings>), playerColors });
  return { ...raw, meta: { ...meta, schemaVersion: 2, settings } };
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
  try {
    const current = version === 1 ? migrateV1(raw) : raw;
    if (!current || !shapeIsValid(current)) return { ok: false, problem: 'corrupt' };
    const state = current as unknown as GameState;
    if (checkInvariants(state).length > 0) return { ok: false, problem: 'corrupt' };
    return { ok: true, state };
  } catch {
    return { ok: false, problem: 'corrupt' };
  }
}
