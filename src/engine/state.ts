// Creating a new game (spec 5.1 and section 8).
import { BALANCE, BOARD_SHAPE, BOARD_SIZE, SETUP } from '../data/balance.js';
import { isProperty } from '../data/board.js';
import { PLAYER_COLORS, SEATS } from '../data/players.js';
import { defaultPlayerName } from '../ui/strings.js';
import { buildDecks } from './cards.js';
import { type Ctx, emit } from './core.js';
import { beginTurn } from './phases.js';
import { normalizeSeed, randomInt } from './rng.js';
import type { BoardSettings, GameState, Player, Settings } from './types.js';

/**
 * Version 2 added settings.playerColors, version 3 settings.board; older saves are migrated on load
 * (save.ts).
 */
export const SCHEMA_VERSION = 3;

/** The board in play, as the settings record it. */
export const THIS_BOARD: Readonly<BoardSettings> = { spaces: BOARD_SIZE, shape: BOARD_SHAPE };

/** True when settings' board is the board in play (a game from another board cannot go on). */
export function isThisBoard(board: unknown): boolean {
  if (typeof board !== 'object' || board === null) return false;
  const b = board as Record<string, unknown>;
  return b.spaces === THIS_BOARD.spaces && b.shape === THIS_BOARD.shape;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  playerCount: SETUP.defaultPlayerCount,
  playerNames: SEATS.map((_, i) => defaultPlayerName(i)),
  playerColors: SEATS.map((seat) => seat.color),
  startingMoney: SETUP.defaultStartingMoney,
  mode: 'quick',
  roundLimit: SETUP.defaultRoundLimit,
  freeStay: true,
  vacation: true,
  auction: true,
  chance: true,
  event: true,
  randomFirstPlayer: false,
  passDevice: true,
  animationSpeed: 'normal',
  board: THIS_BOARD,
};

/**
 * Six different palette colours. Valid choices are kept (the earlier seat wins a duplicate); any
 * other seat gets its own seat colour if it is free, else the first free palette colour.
 */
function normalizeColors(input: unknown): string[] {
  const wanted = Array.isArray(input) ? input : [];
  const chosen = SEATS.map((_, i) => {
    const c = wanted[i];
    return typeof c === 'string' && PLAYER_COLORS.includes(c) ? c : null;
  });
  chosen.forEach((c, i) => {
    if (c !== null && chosen.indexOf(c) !== i) chosen[i] = null;
  });
  const used = new Set(chosen.filter((c): c is string => c !== null));
  return chosen.map((c, i) => {
    if (c !== null) return c;
    const seatColor = (SEATS[i] as (typeof SEATS)[number]).color;
    const fill = used.has(seatColor) ? (PLAYER_COLORS.find((p) => !used.has(p)) as string) : seatColor;
    used.add(fill);
    return fill;
  });
}

/** Fills gaps and clamps every option to the values the setup screen offers. */
export function normalizeSettings(input: Partial<Settings> = {}): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...input, playerNames: [] };
  const playerCount = SETUP.playerCounts.includes(merged.playerCount) ? merged.playerCount : SETUP.defaultPlayerCount;
  const names = input.playerNames ?? [];
  const playerNames = SEATS.map((_, i) => {
    const raw = typeof names[i] === 'string' ? (names[i] as string) : '';
    const trimmed = raw.trim().slice(0, SETUP.maxNameLength);
    return trimmed.length > 0 ? trimmed : defaultPlayerName(i);
  });
  return {
    playerCount,
    playerNames,
    playerColors: normalizeColors(input.playerColors),
    startingMoney: SETUP.startingMoney.includes(merged.startingMoney) ? merged.startingMoney : SETUP.defaultStartingMoney,
    mode: merged.mode === 'normal' ? 'normal' : 'quick',
    roundLimit:
      Number.isInteger(merged.roundLimit) &&
      merged.roundLimit >= SETUP.minRoundLimit &&
      merged.roundLimit <= SETUP.maxRoundLimit
        ? merged.roundLimit
        : SETUP.defaultRoundLimit,
    freeStay: merged.freeStay !== false,
    vacation: merged.vacation !== false,
    auction: merged.auction !== false,
    chance: merged.chance !== false,
    event: merged.event !== false,
    randomFirstPlayer: merged.randomFirstPlayer === true,
    passDevice: merged.passDevice !== false,
    animationSpeed:
      merged.animationSpeed === 'fast' || merged.animationSpeed === 'off' ? merged.animationSpeed : 'normal',
    board: { ...THIS_BOARD },
  };
}

function newPlayer(seat: number, settings: Settings): Player {
  const seatData = SEATS[seat];
  if (!seatData) throw new Error(`No seat ${seat}`);
  return {
    id: seat,
    name: settings.playerNames[seat] ?? defaultPlayerName(seat),
    color: settings.playerColors[seat] ?? seatData.color,
    token: seatData.token,
    cash: settings.startingMoney,
    position: 0,
    freeStay: settings.freeStay ? BALANCE.freeStayStart : 0,
    inJail: false,
    jailAttempts: 0,
    skipNextTurn: false,
    jailCards: [],
    houseVouchers: [],
    bankrupt: false,
    bankruptOrder: null,
    recap: [],
  };
}

/** A new game, already at the first player's turn start. Same settings + seed = same game. */
export function createGame(input: Partial<Settings>, seed: number): GameState {
  const settings = normalizeSettings(input);
  const s: GameState = {
    players: Array.from({ length: settings.playerCount }, (_, seat) => newPlayer(seat, settings)),
    properties: Array.from({ length: BOARD_SIZE }, (_, i) =>
      isProperty(i) ? { owner: null, level: 0, mortgaged: false } : null,
    ),
    decks: { chanceDeck: [], chanceDiscard: [], eventDeck: [], eventDiscard: [] },
    turn: {
      currentPlayerIndex: 0,
      doublesCount: 0,
      landedCity: null,
      turnNumber: 0,
      roundNumber: 1,
      roundStartSeat: 0,
      rollsLeft: 0,
      dice: null,
      recap: [],
    },
    flow: { phase: 'PassDevice', pending: null, trade: null, notices: [], debts: [], resume: null, modifiers: [] },
    meta: {
      schemaVersion: SCHEMA_VERSION,
      settings,
      seed: normalizeSeed(seed),
      rngState: normalizeSeed(seed),
      winner: null,
      endReason: null,
      log: [],
      logSeq: 0,
      forcedDice: [],
      forcedCards: { chance: null, event: null },
      stats: { housesBuilt: 0, hotelsBuilt: 0, bankruptcies: 0 },
    },
  };
  const c: Ctx = { s, events: [] };
  s.decks = buildDecks(s);
  // Turn order is seating order; Player 1 starts unless the random first player option is on.
  const first = settings.randomFirstPlayer ? randomInt(s, 0, settings.playerCount - 1) : 0;
  s.turn.roundStartSeat = first;
  emit(c, { type: 'gameStarted', firstPlayer: first });
  beginTurn(c, first);
  return s;
}
