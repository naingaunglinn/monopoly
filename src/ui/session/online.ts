// OnlineSession: a game in a room on the server (spec section 17). The server is the authority:
// actions are POSTed with the version this device saw, and every new version arrives through the
// transport (stream, or polling as a fallback) and is animated exactly like a local action.
// Updates wait while an animation plays, so every player's moves are shown in full.
// This module also holds the room operations the screens call (create, join, lobby, host).
// It never touches the local save.
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  actorFor,
  decisionMaker,
  validateAction,
  type Action,
  type AnimationSpeed,
  type EngineError,
  type GameState,
} from '../../engine';
import { HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, type RoomSettings, type RoomUpdate, type RoomView } from '../../online/protocol';
import { getDisplay, subscribeDisplay } from '../display';
import { getPrefs, setPrefs } from '../prefs';
import { app, refuse, resetUi, ROUNDS_PARAM, sessionHost, setSession, showToast } from '../store';
import { T } from '../strings';
import { RoomTransport, type LinkStatus } from './transport';
import type { GameSession } from './types';

// ---------------------------------------------------------------------------------------------
// Credentials: this browser's private seat tokens for one room (localStorage, never sent elsewhere).

export const CREDENTIALS_KEY = 'global-monopoly/online/v1';

export interface SeatCredential {
  seatId: string;
  token: string;
}

export interface Credentials {
  code: string;
  seats: SeatCredential[];
}

export function readCredentials(): Credentials | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CREDENTIALS_KEY) ?? 'null') as Credentials | null;
    if (!raw || typeof raw.code !== 'string' || !Array.isArray(raw.seats)) return null;
    const seats = raw.seats.filter((s) => typeof s?.seatId === 'string' && typeof s?.token === 'string');
    return seats.length > 0 ? { code: raw.code, seats } : null;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: Credentials | null): void {
  try {
    if (creds && creds.seats.length > 0) window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
    else window.localStorage.removeItem(CREDENTIALS_KEY);
  } catch {
    // Storage blocked: the seat lasts as long as this tab.
  }
}

// ---------------------------------------------------------------------------------------------
// State the online screens read

export interface OnlineState {
  code: string;
  view: RoomView;
  /** Seat indexes this device holds. */
  mine: number[];
  /** Seat id -> last heartbeat, on the server's clock. */
  presence: Record<string, number>;
  /** Server clock minus this device's clock, ms. */
  offset: number;
  link: LinkStatus;
  /** The action waiting for the server's answer: the button shows a spinner after 300 ms. */
  pending: { target: string | null; since: number } | null;
}

/** The create and join screens. */
export interface JoinState {
  mode: 'create' | 'join';
  code: string;
  /** The room, once the code is known (to list seats that can be taken over). */
  view: RoomView | null;
  presence: Record<string, number>;
  offset: number;
  error: string | null;
  busy: boolean;
}

class Box<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = (): T => this.value;
  set = (value: T): void => {
    this.value = value;
    for (const l of this.listeners) l();
  };
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const online = new Box<OnlineState | null>(null);
export const joining = new Box<JoinState>({ mode: 'join', code: '', view: null, presence: {}, offset: 0, error: null, busy: false });

export function useOnline(): OnlineState | null {
  return useSyncExternalStore(online.subscribe, online.get, online.get);
}

export function useJoining(): JoinState {
  return useSyncExternalStore(joining.subscribe, joining.get, joining.get);
}

function patchOnline(patch: Partial<OnlineState>): void {
  const st = online.get();
  if (st) online.set({ ...st, ...patch });
}

function patchJoining(patch: Partial<JoinState>): void {
  joining.set({ ...joining.get(), ...patch });
}

/**
 * True when the seat's device sent a heartbeat in the last 45 s. A seat this device has no record
 * for yet (it just joined) counts as connected until the next heartbeat answer brings its time.
 */
export function isSeatConnected(st: { presence: Record<string, number>; offset: number }, seatId: string | undefined): boolean {
  if (!seatId) return false;
  const seen = st.presence[seatId];
  return seen === undefined || Date.now() + st.offset - seen <= PRESENCE_TIMEOUT_MS;
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/?room=${code}`;
}

// ---------------------------------------------------------------------------------------------
// API client

type ApiOk<T> = { ok: true; data: T };
type ApiFail = { ok: false; status: number; error: string; reason?: string; version?: number };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiOk<T> | ApiFail> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; reason?: string; version?: number };
    if (res.ok) return { ok: true, data };
    return { ok: false, status: res.status, error: data.error ?? 'server', reason: data.reason, version: data.version };
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }
}

export function errorText(r: { error: string; reason?: string }): string {
  return r.reason ?? T.online.errors[r.error] ?? T.online.errors.server ?? '';
}

interface SeatGrant {
  code: string;
  token: string;
  seatId: string;
  you: number[];
  view: RoomView;
  now: number;
}

interface RoomInfo {
  view: RoomView | null;
  presence?: Record<string, number>;
  now: number;
}

interface Heartbeat {
  now: number;
  presence: Record<string, number>;
  you: number[];
  /** The seats (by id) the tokens sent still hold. */
  seatIds: string[];
  version: number;
  host: number;
}

interface ActionResult extends RoomUpdate {
  view: RoomView;
  now: number;
}

const mineOf = (view: RoomView, creds: Credentials): number[] =>
  view.seats.flatMap((s, i) => (creds.seats.some((c) => c.seatId === s.id) && !s.removed ? [i] : []));

// ---------------------------------------------------------------------------------------------

export class OnlineSession implements GameSession {
  readonly mode = 'online' as const;
  private readonly transport: RoomTransport;
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private readonly unsubscribe: () => void;
  private queue: { entries: RoomUpdate[]; view: RoomView }[] = [];
  private shown: number;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private creds: Credentials,
    initial: { view: RoomView; presence: Record<string, number>; now: number },
  ) {
    this.shown = initial.view.version;
    online.set({
      code: creds.code,
      view: initial.view,
      mine: mineOf(initial.view, creds),
      presence: initial.presence,
      offset: initial.now - Date.now(),
      link: 'connecting',
      pending: null,
    });
    this.transport = new RoomTransport(creds.code, initial.view.version, {
      updates: (entries, view) => this.receive(entries, view),
      status: (link) => {
        patchOnline({ link });
        if (link === 'gone') this.roomGone();
      },
    });
    this.transport.start();
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
    void this.heartbeat();
    this.unsubscribe = subscribeDisplay(() => {
      if (!getDisplay().busy) this.flush();
    });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  // GameSession ------------------------------------------------------------------------------

  dispatch(action: Action, target: string | null): EngineError | null {
    const st = online.get();
    const game = st?.view.game;
    if (!st || !game) return null;
    // Never send twice: one action at a time.
    if (st.pending) return null;
    if (action.type === 'setAnimationSpeed') {
      this.setAnimationSpeed(action.speed);
      return null;
    }
    if (action.type === 'setPassDevice' || action.type === 'debug' || action.type === 'removePlayer') return null;
    if (st.link === 'offline' || st.link === 'gone') {
      refuse(T.online.reconnecting, target);
      return null;
    }
    const actor = actorFor(game, action);
    if (actor === null || !this.controls(actor)) {
      const waiting = decisionMaker(game);
      refuse(T.online.waitingFor(game.players[waiting ?? 0]?.name ?? ''), target);
      return null;
    }
    const error = validateAction(game, action);
    if (error) {
      refuse(error.reason, target);
      return error;
    }
    const token = this.tokenFor(actor);
    if (!token) return null;
    patchOnline({ pending: { target, since: Date.now() } });
    void this.send(action, token, target, st.view.version);
    return null;
  }

  controls(player: number | null): boolean {
    const st = online.get();
    if (!st || player === null) return false;
    if (st.mine.includes(player)) return true;
    const proxy = st.view.seats[player]?.proxy;
    return proxy !== null && proxy !== undefined && st.mine.includes(proxy);
  }

  animationSpeed(): AnimationSpeed {
    return getPrefs().onlineSpeed;
  }

  setAnimationSpeed(speed: AnimationSpeed): void {
    setPrefs({ onlineSpeed: speed });
  }

  save(): boolean {
    return true;
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.transport.stop();
    clearInterval(this.heartbeatTimer);
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    this.unsubscribe();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    online.set(null);
  }

  // Online -----------------------------------------------------------------------------------

  get credentials(): Credentials {
    return this.creds;
  }

  /** A new seat on this device (lobby: "Add a player on this device"). */
  addCredential(seat: SeatCredential, view: RoomView): void {
    this.creds = { code: this.creds.code, seats: [...this.creds.seats.filter((s) => s.seatId !== seat.seatId), seat] };
    writeCredentials(this.creds);
    this.applyView([], view);
    const st = online.get();
    if (st) online.set({ ...st, mine: mineOf(st.view, this.creds) });
  }

  /** The token that may act for this player: their own, or the seat that plays for them. */
  tokenFor(player: number): string | null {
    const st = online.get();
    if (!st) return null;
    const seat = st.view.seats[player];
    const own = this.creds.seats.find((c) => c.seatId === seat?.id);
    if (own && st.mine.includes(player)) return own.token;
    const proxy = seat?.proxy;
    if (proxy === null || proxy === undefined) return null;
    return this.creds.seats.find((c) => c.seatId === st.view.seats[proxy]?.id)?.token ?? null;
  }

  /** An answer from the server to something this device sent (it already has the new view). */
  applyResult(result: { v: number; events: RoomUpdate['events']; kind: RoomUpdate['kind']; seat: number | null; view: RoomView }): void {
    this.queue = this.queue.filter((q) => q.view.version > result.view.version);
    this.transport.advance(result.view.version);
    this.applyView([{ v: result.v, kind: result.kind, seat: result.seat, events: result.events }], result.view);
  }

  private async send(action: Action, token: string, target: string | null, expectedVersion: number): Promise<void> {
    const r = await call<ActionResult>('POST', '/api/room?op=action', { code: this.creds.code, token, action, expectedVersion });
    patchOnline({ pending: null });
    if (this.stopped) return;
    if (r.ok) {
      this.applyResult(r.data);
      return;
    }
    if (r.error === 'stale') void this.transport.resync();
    refuse(errorText(r), target);
  }

  private receive(entries: RoomUpdate[], view: RoomView): void {
    this.queue.push({ entries, view });
    this.flush();
  }

  /** Shows queued versions one by one, each after the previous animation; a long backlog at once. */
  private flush(): void {
    while (this.queue.length > 0 && !getDisplay().busy) {
      if (this.queue.length > 3) {
        const view = (this.queue[this.queue.length - 1] as { view: RoomView }).view;
        this.queue = [];
        this.applyView([], view);
        continue;
      }
      const next = this.queue.shift() as { entries: RoomUpdate[]; view: RoomView };
      this.applyView(next.entries, next.view);
    }
  }

  private applyView(entries: RoomUpdate[], view: RoomView): void {
    const st = online.get();
    // Each version is shown once, whichever arrives first: the stream or this device's own answer.
    if (!st || view.version <= this.shown) return;
    const prevGame = st.view.game;
    const consecutive = entries.length > 0 && entries[0]?.v === this.shown + 1;
    this.shown = view.version;
    online.set({ ...st, view, mine: mineOf(view, this.creds) });
    // Someone joined, took a seat back or the game started: refresh who is connected now.
    if (entries.some((e) => e.kind === 'joined' || e.kind === 'reclaimed' || e.kind === 'started' || e.kind === 'host')) {
      void this.heartbeat();
    }
    if (!view.game) return;
    if (app.get().screen !== 'game') {
      enterGame(view.game);
      return;
    }
    const events = consecutive && prevGame ? entries.flatMap((e) => e.events) : [];
    sessionHost.show(events.length > 0 ? prevGame : null, view.game, events, this.animationSpeed());
  }

  private async heartbeat(): Promise<void> {
    if (this.stopped) return;
    const sent = this.creds.seats.slice();
    const r = await call<Heartbeat>('POST', '/api/room?op=heartbeat', { code: this.creds.code, tokens: sent.map((s) => s.token) });
    if (this.stopped) return;
    if (!r.ok) {
      // Only when every seat this request named is gone (a seat added meanwhile is not).
      if (r.error === 'notInRoom' && this.creds.seats.every((c) => sent.includes(c))) this.seatsLost();
      else if (r.error === 'roomNotFound') this.roomGone();
      // No answer at all: this device is offline (the stream may not have noticed yet).
      else if (r.error === 'network') patchOnline({ link: 'offline' });
      return;
    }
    const st = online.get();
    if (!st) return;
    // Back online: show the transport's own state again (it resyncs below if anything was missed).
    if (st.link === 'offline') patchOnline({ link: this.transport.status === 'offline' ? 'polling' : this.transport.status });
    // Seats taken over on another device leave this one (only seats this heartbeat asked about).
    const lost = sent.filter((c) => !r.data.seatIds.includes(c.seatId));
    if (lost.length > 0) {
      this.creds = { code: this.creds.code, seats: this.creds.seats.filter((c) => !lost.includes(c)) };
      writeCredentials(this.creds);
    }
    patchOnline({ presence: r.data.presence, offset: r.data.now - Date.now(), mine: mineOf(st.view, this.creds) });
    if (r.data.version > this.shown) void this.transport.resync();
  }

  private seatsLost(): void {
    writeCredentials(null);
    leaveToStart();
    showToast(T.online.leftGame);
  }

  private roomGone(): void {
    patchOnline({ link: 'gone' });
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      // A tab left in the background stops its stream after 10 minutes (it resyncs on return).
      this.hiddenTimer = setTimeout(() => this.transport.stop(), 10 * 60_000);
      return;
    }
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    this.hiddenTimer = null;
    this.transport.start();
    void this.transport.resync();
    void this.heartbeat();
  };

  private onOnline = (): void => {
    void this.transport.resync();
    void this.heartbeat();
  };

  private onOffline = (): void => {
    patchOnline({ link: 'offline' });
  };
}

// ---------------------------------------------------------------------------------------------
// Room operations for the screens. Each returns an error text to show, or null.

let active: OnlineSession | null = null;

/** The online session in use, if any. */
export function activeOnline(): OnlineSession | null {
  return active;
}

function begin(creds: Credentials, view: RoomView, presence: Record<string, number>, now: number): void {
  writeCredentials(creds);
  const session = new OnlineSession(creds, { view, presence, now });
  active = session;
  setSession(session);
  resetUi();
  app.set({ screen: view.game ? 'game' : 'lobby', mode: 'online', game: view.game ?? null, events: [], eventSeq: app.get().eventSeq + 1, refusal: null, saveProblem: null });
  setRoomInUrl(creds.code);
}

function enterGame(game: GameState): void {
  resetUi();
  app.set({ screen: 'game', mode: 'online', game, events: [], eventSeq: app.get().eventSeq + 1, refusal: null });
}

function setRoomInUrl(code: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    window.history.replaceState(null, '', url.toString());
  } catch {
    // Not important.
  }
}

/** Leaves the online game screens (the seat stays: the room can be rejoined). */
export function leaveToStart(): void {
  active = null;
  setSession(null);
  resetUi();
  setRoomInUrl(null);
  app.set({ screen: 'start', mode: null, game: null, events: [], refusal: null });
}

export function showCreate(): void {
  joining.set({ mode: 'create', code: '', view: null, presence: {}, offset: 0, error: null, busy: false });
  app.set({ screen: 'online' });
}

export function showJoin(code = ''): void {
  joining.set({ mode: 'join', code, view: null, presence: {}, offset: 0, error: null, busy: false });
  app.set({ screen: 'online' });
  if (code) void lookUpRoom(code);
}

/** Loads a room for the join screen (its seats, and which are disconnected). */
export async function lookUpRoom(code: string): Promise<void> {
  const r = await call<RoomInfo>('GET', `/api/room?code=${encodeURIComponent(code)}&probe=1`);
  if (!r.ok) {
    patchJoining({ error: errorText(r), view: null });
    return;
  }
  if (!r.data.view) {
    patchJoining({ error: T.online.errors.roomNotFound ?? null, view: null });
    return;
  }
  patchJoining({ view: r.data.view, presence: r.data.presence ?? {}, offset: r.data.now - Date.now(), error: null });
}

export async function createRoom(name: string): Promise<void> {
  patchJoining({ busy: true, error: null });
  const settings: Partial<RoomSettings> = Number.isInteger(ROUNDS_PARAM) && ROUNDS_PARAM > 0 ? { roundLimit: ROUNDS_PARAM } : {};
  const r = await call<SeatGrant>('POST', '/api/room?op=create', { name, settings });
  if (!r.ok) {
    patchJoining({ busy: false, error: errorText(r) });
    return;
  }
  patchJoining({ busy: false });
  begin({ code: r.data.code, seats: [{ seatId: r.data.seatId, token: r.data.token }] }, r.data.view, {}, r.data.now);
}

export async function joinRoom(code: string, name: string): Promise<void> {
  patchJoining({ busy: true, error: null });
  const r = await call<SeatGrant>('POST', '/api/room?op=join', { code, name });
  if (!r.ok) {
    patchJoining({ busy: false, error: errorText(r) });
    return;
  }
  patchJoining({ busy: false });
  begin({ code: r.data.code, seats: [{ seatId: r.data.seatId, token: r.data.token }] }, r.data.view, {}, r.data.now);
}

/** Takes over a disconnected seat (a player who switched device or browser). */
export async function reclaimSeat(code: string, seatId: string): Promise<void> {
  patchJoining({ busy: true, error: null });
  const existing = readCredentials();
  const tokens = existing?.code === code ? existing.seats.map((s) => s.token) : [];
  const r = await call<SeatGrant>('POST', '/api/room?op=reclaim', { code, seat: seatId, tokens });
  if (!r.ok) {
    patchJoining({ busy: false, error: errorText(r) });
    return;
  }
  patchJoining({ busy: false });
  const seats = [...(existing?.code === code ? existing.seats : []).filter((s) => s.seatId !== r.data.seatId), { seatId: r.data.seatId, token: r.data.token }];
  begin({ code, seats }, r.data.view, {}, r.data.now);
}

/** Opens an invite link (?room=ABCD): back into this browser's seats, or the join screen. */
export async function openRoom(code: string): Promise<void> {
  const creds = readCredentials();
  if (creds?.code === code && (await rejoin(creds))) return;
  showJoin(code);
}

/** The stored room, if it still exists (for the start screen's Rejoin button). No request without one. */
export async function probeRejoin(): Promise<string | null> {
  const creds = readCredentials();
  if (!creds) return null;
  const r = await call<RoomInfo>('GET', `/api/room?code=${encodeURIComponent(creds.code)}&probe=1`);
  if (r.ok && r.data.view === null) {
    writeCredentials(null);
    return null;
  }
  return r.ok ? creds.code : null;
}

/** Back into the stored seats, with a full sync. False when none of them is ours any more. */
export async function rejoin(creds: Credentials | null = readCredentials()): Promise<boolean> {
  if (!creds) return false;
  const beat = await call<Heartbeat>('POST', '/api/room?op=heartbeat', { code: creds.code, tokens: creds.seats.map((s) => s.token) });
  if (!beat.ok) {
    if (beat.error === 'notInRoom' || beat.error === 'roomNotFound') writeCredentials(null);
    return false;
  }
  const room = await call<RoomInfo>('GET', `/api/room?code=${encodeURIComponent(creds.code)}&probe=1`);
  if (!room.ok || !room.data.view) return false;
  const view = room.data.view;
  const seats = creds.seats.filter((c) => beat.data.seatIds.includes(c.seatId));
  if (seats.length === 0) return false;
  begin({ code: creds.code, seats }, view, room.data.presence ?? beat.data.presence, room.data.now);
  return true;
}

/** Lobby: another person on this device takes a seat. */
export async function addLocalSeat(name: string): Promise<string | null> {
  const session = active;
  const st = online.get();
  if (!session || !st) return null;
  const r = await call<SeatGrant>('POST', '/api/room?op=join', { code: st.code, name, tokens: session.credentials.seats.map((s) => s.token) });
  if (!r.ok) return errorText(r);
  session.addCredential({ seatId: r.data.seatId, token: r.data.token }, r.data.view);
  return null;
}

/** Lobby: rename a seat of this device or pick a free colour. */
export async function updateSeat(seat: number, patch: { name?: string; color?: string }): Promise<string | null> {
  const session = active;
  const st = online.get();
  const token = session?.tokenFor(seat);
  if (!session || !st || !token) return null;
  const r = await call<{ view: RoomView }>('POST', '/api/room?op=seat', { code: st.code, token, ...patch });
  if (!r.ok) return errorText(r);
  session.applyResult({ v: r.data.view.version, events: [], kind: 'seat', seat, view: r.data.view });
  return null;
}

/** Lobby: every seat of this device leaves the room. */
export async function leaveRoom(): Promise<void> {
  const session = active;
  const st = online.get();
  if (session && st && !st.view.game) {
    for (const c of session.credentials.seats) await call('POST', '/api/room?op=leave', { code: st.code, token: c.token });
    writeCredentials(null);
  }
  leaveToStart();
}

export async function changeRoomSettings(patch: Partial<RoomSettings>): Promise<string | null> {
  const session = active;
  const st = online.get();
  const token = st ? session?.tokenFor(st.view.host) : null;
  if (!session || !st || !token) return null;
  const r = await call<{ view: RoomView }>('POST', '/api/room?op=settings', { code: st.code, token, settings: patch });
  if (!r.ok) return errorText(r);
  session.applyResult({ v: r.data.view.version, events: [], kind: 'settings', seat: st.view.host, view: r.data.view });
  return null;
}

export async function startRoomGame(): Promise<string | null> {
  const session = active;
  const st = online.get();
  const token = st ? session?.tokenFor(st.view.host) : null;
  if (!session || !st || !token) return null;
  const r = await call<ActionResult>('POST', '/api/room?op=start', { code: st.code, token });
  if (!r.ok) return errorText(r);
  session.applyResult(r.data);
  return null;
}

/** Host controls: play for a disconnected player, stop, or remove them (bankrupt to the bank). */
export async function hostControl(hostOp: 'playFor' | 'stopPlayingFor' | 'remove', seatId: string): Promise<string | null> {
  const session = active;
  const st = online.get();
  const token = st ? session?.tokenFor(st.view.host) : null;
  if (!session || !st || !token) return null;
  const r = await call<ActionResult>('POST', '/api/room?op=host', { code: st.code, token, hostOp, seat: seatId });
  if (!r.ok) return errorText(r);
  session.applyResult(r.data);
  return null;
}

/** This device is the host's. */
export function amHost(st: OnlineState | null): boolean {
  return !!st && st.mine.includes(st.view.host);
}

/** True once the action sent from this button has waited 300 ms for the server (show a spinner). */
export function usePending(id: string | null | undefined): boolean {
  const st = useOnline();
  const pending = st?.pending ?? null;
  const active = !!id && pending !== null && pending.target === id;
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!active || !pending) return;
    const wait = 300 - (Date.now() - pending.since);
    if (wait <= 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), wait);
    return () => clearTimeout(timer);
  }, [active, pending]);
  return active && pending !== null && Date.now() - pending.since >= 300;
}

// Read-only test hook beside window.__GM__.getState (store.ts): which seats this device holds and
// the version it shows. It exposes no way to act.
if (typeof window !== 'undefined') {
  const hook = (window as unknown as { __GM__?: Record<string, unknown> }).__GM__;
  if (hook) hook.getOnline = () => {
    const st = online.get();
    return st
      ? {
          code: st.code,
          mine: st.mine,
          // Seats this device may act for: its own and those the host plays for.
          controls: st.view.seats.flatMap((s, i) => (st.mine.includes(i) || (s.proxy !== null && st.mine.includes(s.proxy)) ? [i] : [])),
          version: st.view.version,
          status: st.view.status,
          link: st.link,
          host: st.view.host,
          pending: st.pending !== null,
        }
      : null;
  };
}

/** Re-renders every few seconds while online, so "Disconnected" badges appear on time. */
export function usePresenceClock(ms = 5000): void {
  const st = useOnline();
  const [, tick] = useState(0);
  const active = st !== null;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(timer);
  }, [active, ms]);
}
