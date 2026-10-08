// Online rooms (spec section 17): the lobby, the seats and the authoritative game. Everything here is
// pure: the handlers load a room from the store, call one of these operations, and save the result
// with a compare-and-set on the room's version.
import { SETUP } from '../src/data/balance.js';
import { PLAYER_COLORS } from '../src/data/players.js';
import {
  actorFor,
  createGame,
  DEFAULT_SETTINGS,
  legalActions,
  normalizeSettings,
  publicView,
  reduce,
  validateAction,
  type Action,
  type GameEvent,
  type GameState,
  type Settings,
} from '../src/engine/index.js';
import { defaultPlayerName } from '../src/ui/strings.js';

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

export interface Seat {
  /** Stable id (indexes shift when a lobby seat leaves). */
  id: string;
  name: string;
  color: string;
  /** SHA-256 of the seat's private token; the token itself is only on the player's device. */
  tokenHash: string;
  /** The seat index of the host who plays for this seat until its player returns. */
  proxy: number | null;
  /** Removed by the host during the game (bankrupt to the bank). */
  removed: boolean;
}

export interface Room {
  code: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  /** Seat index of the host. */
  host: number;
  /** In the lobby: in joining order. Once the game starts, seat index = player id. */
  seats: Seat[];
  settings: RoomSettings;
  /** The full game, including the seed and deck order. Never sent to a device. */
  game: GameState | null;
}

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

export interface OpError {
  error: ErrorCode;
  status: number;
  /** Plain-language reason from the engine, for illegal actions. */
  reason?: string;
}

export const fail = (error: ErrorCode, status: number, reason?: string): OpError => ({ error, status, ...(reason ? { reason } : {}) });

export function isError<T>(value: T | OpError): value is OpError {
  return typeof value === 'object' && value !== null && 'error' in value && 'status' in value;
}

export function statusOf(room: Room): RoomStatus {
  if (!room.game) return 'lobby';
  return room.game.flow.phase === 'GameOver' ? 'over' : 'playing';
}

export function viewOf(room: Room): RoomView {
  return {
    code: room.code,
    version: room.version,
    status: statusOf(room),
    host: room.host,
    seats: room.seats.map(({ id, name, color, proxy, removed }) => ({ id, name, color, proxy, removed })),
    settings: room.settings,
    game: room.game ? publicView(room.game) : null,
  };
}

export function defaultRoomSettings(): RoomSettings {
  return pickRoomSettings(DEFAULT_SETTINGS);
}

function pickRoomSettings(s: Settings): RoomSettings {
  return {
    startingMoney: s.startingMoney,
    mode: s.mode,
    roundLimit: s.roundLimit,
    freeStay: s.freeStay,
    vacation: s.vacation,
    auction: s.auction,
    chance: s.chance,
    event: s.event,
    randomFirstPlayer: s.randomFirstPlayer,
  };
}

/** Clamps every option to what setup offers (the same rules as a local game). */
export function cleanSettings(current: RoomSettings, patch: unknown): RoomSettings {
  const input = typeof patch === 'object' && patch !== null ? (patch as Partial<RoomSettings>) : {};
  const merged = { ...current };
  for (const key of Object.keys(current) as (keyof RoomSettings)[]) {
    if (key in input) (merged as Record<string, unknown>)[key] = input[key];
  }
  return pickRoomSettings(normalizeSettings(merged));
}

export function cleanName(raw: unknown, seatIndex: number): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, SETUP.maxNameLength) : '';
  return name.length > 0 ? name : defaultPlayerName(seatIndex);
}

function firstFreeColor(seats: Seat[], wanted: unknown): string {
  const taken = new Set(seats.map((s) => s.color));
  if (typeof wanted === 'string' && PLAYER_COLORS.includes(wanted) && !taken.has(wanted)) return wanted;
  return PLAYER_COLORS.find((c) => !taken.has(c)) as string;
}

/** A new room with its creator in the first seat, as host. */
export function newRoom(args: {
  code: string;
  now: number;
  seatId: string;
  tokenHash: string;
  name: unknown;
  color?: unknown;
  settings?: unknown;
}): Room {
  const seat: Seat = {
    id: args.seatId,
    name: cleanName(args.name, 0),
    color: firstFreeColor([], args.color),
    tokenHash: args.tokenHash,
    proxy: null,
    removed: false,
  };
  return {
    code: args.code,
    version: 1,
    createdAt: args.now,
    updatedAt: args.now,
    host: 0,
    seats: [seat],
    settings: cleanSettings(defaultRoomSettings(), args.settings),
    game: null,
  };
}

/** The next version of a room (the caller fills in what changed). */
export function bump(room: Room, now: number): Room {
  return { ...room, version: room.version + 1, updatedAt: now, seats: room.seats.map((s) => ({ ...s })) };
}

export function seatIndexOf(room: Room, tokenHash: string): number {
  return room.seats.findIndex((s) => s.tokenHash === tokenHash && !s.removed);
}

export function isConnected(lastSeen: number | undefined, now: number): boolean {
  return lastSeen !== undefined && now - lastSeen <= PRESENCE_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------------------------
// Lobby

export function addSeat(room: Room, args: { seatId: string; tokenHash: string; name: unknown; color?: unknown; now: number }): Room | OpError {
  if (room.game) return fail('started', 409);
  if (room.seats.length >= MAX_SEATS) return fail('full', 409);
  const next = bump(room, args.now);
  next.seats.push({
    id: args.seatId,
    name: cleanName(args.name, room.seats.length),
    color: firstFreeColor(room.seats, args.color),
    tokenHash: args.tokenHash,
    proxy: null,
    removed: false,
  });
  return next;
}

/** A player renames their seat or picks a colour nobody else has (lobby only). */
export function updateSeat(room: Room, seat: number, patch: { name?: unknown; color?: unknown }, now: number): Room | OpError {
  if (room.game) return fail('started', 409);
  const next = bump(room, now);
  const target = next.seats[seat] as Seat;
  if (patch.name !== undefined) target.name = cleanName(patch.name, seat);
  if (patch.color !== undefined) {
    if (typeof patch.color !== 'string' || !PLAYER_COLORS.includes(patch.color)) return fail('badRequest', 400);
    if (next.seats.some((s, i) => i !== seat && s.color === patch.color)) return fail('colorTaken', 409);
    target.color = patch.color;
  }
  return next;
}

/** A seat leaves the lobby; the others move up. The host passes to the first seat left. */
export function removeSeat(room: Room, seat: number, now: number): Room | OpError {
  if (room.game) return fail('started', 409);
  const next = bump(room, now);
  next.seats.splice(seat, 1);
  if (room.host === seat) next.host = 0;
  else if (room.host > seat) next.host = room.host - 1;
  return next;
}

export function changeSettings(room: Room, patch: unknown, now: number): Room | OpError {
  if (room.game) return fail('started', 409);
  const next = bump(room, now);
  next.settings = cleanSettings(room.settings, patch);
  return next;
}

/** The host starts the game with the seats taken, in seat order. No pass-device screen online. */
export function startGame(room: Room, seed: number, now: number): Room | OpError {
  if (room.game) return fail('started', 409);
  if (room.seats.length < MIN_SEATS || room.seats.length > MAX_SEATS) return fail('notEnoughPlayers', 409);
  const next = bump(room, now);
  next.game = createGame(
    {
      ...room.settings,
      playerCount: room.seats.length,
      playerNames: room.seats.map((s) => s.name),
      playerColors: room.seats.map((s) => s.color),
      passDevice: false,
      animationSpeed: 'normal',
    },
    seed,
  );
  return next;
}

// ---------------------------------------------------------------------------------------------
// The game

/** True when the device holding `seat` may act for `player` now: its own seat, or one the host plays for. */
export function seatControls(room: Room, seat: number, player: number): boolean {
  const target = room.seats[player];
  if (!target || target.removed) return false;
  return (seat === player && !room.seats[seat]?.removed) || target.proxy === seat;
}

/**
 * An action from a seat. Checks, in order: the game is on, the version the device saw is current,
 * the action belongs to a player this seat controls, its type is among legalActions() for that
 * player, and validateAction() accepts it. Then the engine applies it.
 */
export function playAction(
  room: Room,
  seat: number,
  action: unknown,
  expectedVersion: unknown,
  now: number,
): { room: Room; events: GameEvent[] } | OpError {
  const game = room.game;
  if (!game) return fail('notStarted', 409);
  if (game.flow.phase === 'GameOver') return fail('gameOver', 409);
  if (expectedVersion !== room.version) return fail('stale', 409);
  if (typeof action !== 'object' || action === null || typeof (action as { type?: unknown }).type !== 'string') {
    return fail('badRequest', 400);
  }
  const a = action as Action;
  const actor = actorFor(game, a);
  if (actor === null) return fail('illegal', 422);
  if (!seatControls(room, seat, actor)) return fail('notYourTurn', 403);
  const types = new Set(legalActions(game).map((l) => l.type));
  if (!types.has(a.type)) return fail('illegal', 422, validateAction(game, a)?.reason);
  const error = validateAction(game, a);
  if (error) return fail('illegal', 422, error.reason);
  const result = reduce(game, a);
  if (result.error) return fail('illegal', 422, result.error.reason);
  const next = bump(room, now);
  next.game = result.state;
  // A player who acts for themselves is back: the host stops playing for them.
  if (seat === actor && next.seats[seat]) (next.seats[seat] as Seat).proxy = null;
  return { room: next, events: result.events };
}

// ---------------------------------------------------------------------------------------------
// Presence, host handover and host controls

export type Presence = Record<string, number>;

/** The next connected seat after `from` in seat order, or null. */
function nextConnected(room: Room, presence: Presence, from: number, now: number): number | null {
  const n = room.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const s = room.seats[i] as Seat;
    if (!s.removed && isConnected(presence[s.id], now)) return i;
  }
  return null;
}

/** If the host is disconnected, the next connected player becomes host (proxies they held end). */
export function handOverHost(room: Room, presence: Presence, now: number): Room | null {
  const host = room.seats[room.host];
  if (host && !host.removed && isConnected(presence[host.id], now)) return null;
  const nextHost = nextConnected(room, presence, room.host, now);
  if (nextHost === null || nextHost === room.host) return null;
  const next = bump(room, now);
  const oldHost = room.host;
  next.host = nextHost;
  for (const s of next.seats) if (s.proxy === oldHost) s.proxy = null;
  return next;
}

/** Seats whose own player sent a heartbeat stop being played by the host. */
export function endProxies(room: Room, returned: number[], now: number): Room | null {
  if (!returned.some((i) => room.seats[i]?.proxy !== null && room.seats[i]?.proxy !== undefined)) return null;
  const next = bump(room, now);
  for (const i of returned) if (next.seats[i]) (next.seats[i] as Seat).proxy = null;
  return next;
}

export type HostOp = 'playFor' | 'stopPlayingFor' | 'remove';

/**
 * Host controls. In the lobby the host may remove any other seat. During the game the host may play
 * for a disconnected player (until they return) or remove them (bankrupt to the bank).
 */
export function hostControl(
  room: Room,
  hostSeat: number,
  op: unknown,
  target: number,
  presence: Presence,
  now: number,
): { room: Room; events: GameEvent[] } | OpError {
  if (hostSeat !== room.host) return fail('notHost', 403);
  const seat = room.seats[target];
  if (!seat || target === hostSeat || seat.removed) return fail('badRequest', 400);
  if (!room.game) {
    if (op !== 'remove') return fail('notStarted', 409);
    const next = removeSeat(room, target, now);
    return isError(next) ? next : { room: next, events: [] };
  }
  if (room.game.flow.phase === 'GameOver') return fail('gameOver', 409);
  if (op === 'stopPlayingFor') {
    if (seat.proxy !== hostSeat) return fail('badRequest', 400);
    const next = bump(room, now);
    (next.seats[target] as Seat).proxy = null;
    return { room: next, events: [] };
  }
  if (isConnected(presence[seat.id], now)) return fail('seatConnected', 409);
  if (op === 'playFor') {
    const next = bump(room, now);
    (next.seats[target] as Seat).proxy = hostSeat;
    return { room: next, events: [] };
  }
  if (op === 'remove') {
    const result = reduce(room.game, { type: 'removePlayer', player: target });
    if (result.error) return fail('illegal', 422, result.error.reason);
    const next = bump(room, now);
    next.game = result.state;
    const removed = next.seats[target] as Seat;
    removed.removed = true;
    removed.proxy = null;
    for (const s of next.seats) if (s.proxy === target) s.proxy = null;
    return { room: next, events: result.events };
  }
  return fail('badRequest', 400);
}

/** Someone with the room code takes over a disconnected seat (switched device or browser). */
export function reclaimSeat(room: Room, target: number, tokenHash: string, presence: Presence, now: number): Room | OpError {
  const seat = room.seats[target];
  if (!seat) return fail('badRequest', 400);
  if (seat.removed) return fail('seatGone', 409);
  if (isConnected(presence[seat.id], now)) return fail('seatConnected', 409);
  const next = bump(room, now);
  const s = next.seats[target] as Seat;
  s.tokenHash = tokenHash;
  s.proxy = null;
  return next;
}
