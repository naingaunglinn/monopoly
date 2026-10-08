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

/** Chat (spec section 18): the longest message, how many a room keeps, how often a seat may send. */
export const CHAT_MAX_LENGTH = 200;
export const CHAT_KEEP = 100;
export const CHAT_GAP_MS = 600;
export const STAMP_GAP_MS = 1500;
/** Quick reactions: rubber stamps (words, no emoji). */
export const STAMPS = ['nice', 'ouch', 'haha', 'wow', 'hurry', 'gg'] as const;
export type StampId = (typeof STAMPS)[number];

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

/** A chat message or a stamp. Chat lives beside the game: it never changes the room's version. */
export interface ChatMessage {
  /** Increasing per room, from 1. */
  id: number;
  seatId: string;
  /** The sender's name and colour when it was sent (a lobby seat can leave later). */
  name: string;
  color: string;
  /** Server time, ms. */
  at: number;
  text: string | null;
  stamp: StampId | null;
}

/**
 * Voice chat (spec section 18): a device in the room's voice chat. A voice peer is a device, not a
 * seat: one microphone speaks for everyone sitting at it.
 */
export interface VoicePeer {
  /** Stable for the device in this room ("v" and its first seat's id). */
  id: string;
  /** The seats this device holds. */
  seats: string[];
  muted: boolean;
  /** Server time of its last heartbeat or change. */
  at: number;
}

/** Connection set-up between two voice peers (WebRTC session descriptions, all candidates included). */
export interface Signal {
  id: number;
  from: string;
  to: string;
  kind: 'offer' | 'answer';
  sdp: string;
  at: number;
}

/** A server that helps two devices reach each other for voice (WebRTC ICE server: STUN or TURN). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Signals kept for each receiver (set-up takes seconds; older ones are of no use). */
export const SIGNAL_KEEP = 12;
/** The longest session description accepted. */
export const MAX_SDP = 24_000;

/**
 * What a room announces to its open streams besides new versions (a plain number is a version).
 * A signal is only announced (to whom, and its id): its content is fetched with the receiver's seat.
 */
export type Notice = { k: 'chat'; m: ChatMessage } | { k: 'voice'; peers: VoicePeer[] } | { k: 'signal'; to: string; id: number };

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
  | 'gameOver'
  | 'slowDown';
