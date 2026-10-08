// Creating a new game (spec 5.1 and section 8).
import { BALANCE, BOARD_SIZE, SETUP } from '../data/balance';
import { isProperty } from '../data/board';
import { SEATS } from '../data/players';
import { defaultPlayerName } from '../ui/strings';
import { buildDecks } from './cards';
import { type Ctx, emit } from './core';
import { beginTurn } from './phases';
import { normalizeSeed, randomInt } from './rng';
import type { GameState, Player, Settings } from './types';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  playerCount: SETUP.defaultPlayerCount,
  playerNames: SEATS.map((_, i) => defaultPlayerName(i)),
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
};


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
  };
}

function newPlayer(seat: number, settings: Settings): Player {
  const seatData = SEATS[seat];
  if (!seatData) throw new Error(`No seat ${seat}`);
  return {
    id: seat,
    name: settings.playerNames[seat] ?? defaultPlayerName(seat),
    color: seatData.color,
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
