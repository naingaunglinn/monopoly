// The online protocol shared by the browser and the server (spec section 17): what a device sees of
// a room, the updates it receives and the error codes it can get. No secrets live in these types.
// The server reaches this file, so its relative imports carry .js extensions.
import { SETUP } from '../data/balance.js';
import type { GameEvent, GameState, Settings } from '../engine/index.js';

/** Rooms expire this long after their last write (Redis TTL). */
export const ROOM_TTL_SECONDS = 48 * 60 * 60;
/** A seat with no heartbeat for this long shows as disconnected. */
export const PRESENCE_TIMEOUT_MS = 45_000;
/** How often a device sends a heartbeat. */
export const HEARTBEAT_MS = 20_000;
/** How many updates a room keeps for streams and polls to resume from. */
export const LOG_LENGTH = 64;
export const MAX_SEATS = Math.max(...SETUP.playerCounts);
export const MIN_SEATS = Math.min(...SETUP.playerCounts);
/** Room codes: 4 letters, no I or O. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;

/** The options the host chooses (spec section 8, without names, colours and per-device ones). */
export type RoomSettings = Pick<
  Settings,
  'startingMoney' | 'mode' | 'roundLimit' | 'freeStay' | 'vacation' | 'auction' | 'chance' | 'event' | 'randomFirstPlayer'
>;

export type RoomStatus = 'lobby' | 'playing' | 'over';

export interface SeatView {
  id: string;
  name: string;
  color: string;
  proxy: number | null;
  removed: boolean;
}

/** What every device sees: no tokens, no seed, no deck order. */
export interface RoomView {
  code: string;
  version: number;
  status: RoomStatus;
  host: number;
  seats: SeatView[];
  settings: RoomSettings;
  game: GameState | null;
}

export type UpdateKind =
  | 'created'
  | 'joined'
  | 'seat'
  | 'left'
  | 'settings'
  | 'started'
  | 'action'
  | 'host'
  | 'playFor'
  | 'returned'
  | 'removed'
  | 'reclaimed';

/** One version in a room's log: what changed (events to animate). */
export interface LogEntry {
  v: number;
  kind: UpdateKind;
  /** The seat that caused it, if any. */
  seat: number | null;
  events: GameEvent[];
}

/** A log entry as a device receives it; the last one of a batch carries the view after it. */
export interface RoomUpdate extends LogEntry {
  view?: RoomView;
}

export type ErrorCode =
  | 'badRequest'
  | 'roomNotFound'
  | 'notInRoom'
  | 'notHost'
  | 'started'
  | 'notStarted'
  | 'full'
  | 'colorTaken'
  | 'notEnoughPlayers'
  | 'stale'
  | 'conflict'
  | 'notYourTurn'
  | 'illegal'
  | 'seatConnected'
  | 'seatGone'
  | 'gameOver';
