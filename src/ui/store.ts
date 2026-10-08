// The UI side of the game: holds the current GameState and UI-only state (overlays, focus,
// feedback), and sends every action through the active game session (LocalSession on one device,
// OnlineSession in a room). Components read it with useSyncExternalStore; nothing here is game logic.
import { useSyncExternalStore } from 'react';
import type { Action, AnimationSpeed, EngineError, GameEvent, GameState, SaveProblem, Settings } from '../engine';
import { installSkipHandlers, playBatch, resetAnimation } from './animation';
import { usePrefs } from './prefs';
import { LocalSession, readLocalSave } from './session/local';
import { installAudioUnlock, playCue } from './sound';
import type { GameSession, SessionHost, SessionMode } from './session/types';
import type { RuleTopicId } from './strings';

/** online: create or join a room; lobby: the room before its game starts. */
export type Screen = 'start' | 'setup' | 'game' | 'online' | 'lobby';

export interface AppState {
  screen: Screen;
  /** How the current game is played; null before a game starts. */
  mode: SessionMode | null;
  game: GameState | null;
  /** Events of the last successful action, in order (for animation and feedback). */
  events: GameEvent[];
  /** Increments with every successful action. */
  eventSeq: number;
  /** Last refused action: its reason and a counter so the same reason can shake twice. */
  refusal: { reason: string; seq: number; target: string | null } | null;
  saveProblem: SaveProblem | null;
  hasSave: boolean;
}

export type Sheet =
  | { kind: 'properties'; player: number }
  | { kind: 'trade' }
  | { kind: 'results' }
  | { kind: 'settings' }
  | null;

export type Confirm =
  | { kind: 'newGame' }
  | { kind: 'bankruptcy' }
  | { kind: 'acceptTrade' }
  | { kind: 'removePlayer'; seatId: string; name: string }
  | null;

export interface UiState {
  hover: number | null;
  pinned: number | null;
  sheet: Sheet;
  confirm: Confirm;
  rules: { open: boolean; topic: RuleTopicId | null };
  menuOpen: boolean;
  toast: { text: string; seq: number } | null;
  logExpanded: boolean;
  quickHelp: 'freeStay' | 'companies' | 'airports' | 'building' | null;
}

type Listener = () => void;

class Store<T> {
  private listeners = new Set<Listener>();
  constructor(private state: T) {}
  get = (): T => this.state;
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  set(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}

// ---------------------------------------------------------------------------------------------
// Environment

function readSearch(): URLSearchParams {
  try {
    return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  } catch {
    return new URLSearchParams('');
  }
}

const search = readSearch();
export const DEBUG = search.get('debug') === '1';
const SEED_PARAM = search.get('seed');
/** Test hook: ?rounds=N sets the Quick round limit of new games (setup offers 30, 50 and 100). */
export const ROUNDS_PARAM = Number(search.get('rounds'));
/** ?room=ABCD opens that online room (the invite link). */
export const ROOM_PARAM = search.get('room');

/** ?seed=N from the URL, or a random seed from crypto.getRandomValues. Never shown to players. */
export function newSeed(): number {
  const fromUrl = SEED_PARAM !== null ? Number(SEED_PARAM) : NaN;
  if (Number.isFinite(fromUrl)) return Math.abs(Math.floor(fromUrl)) >>> 0;
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] ?? 1;
  } catch {
    return 1;
  }
}


// ---------------------------------------------------------------------------------------------
// Stores

export const app = new Store<AppState>({
  screen: 'start',
  mode: null,
  game: null,
  events: [],
  eventSeq: 0,
  refusal: null,
  saveProblem: null,
  hasSave: readLocalSave() !== null,
});

export const ui = new Store<UiState>({
  hover: null,
  pinned: null,
  sheet: null,
  confirm: null,
  rules: { open: false, topic: null },
  menuOpen: false,
  toast: null,
  logExpanded: false,
  quickHelp: null,
});

export function useApp(): AppState {
  return useSyncExternalStore(app.subscribe, app.get, app.get);
}

export function useUi(): UiState {
  return useSyncExternalStore(ui.subscribe, ui.get, ui.get);
}

/** The current game (only call on the game screen). */
export function useGame(): GameState {
  const { game } = useApp();
  if (!game) throw new Error('No game in progress');
  return game;
}

let refusalSeq = 0;
let toastSeq = 0;

// ---------------------------------------------------------------------------------------------
// Session

/** What the sessions use to show a game: both animate and display updates the same way. */
export const sessionHost: SessionHost = {
  game: () => app.get().game,
  show(prev, next, events, speed) {
    playBatch(prev, next, events, speed, { online: app.get().mode === 'online' });
    app.set({ game: next, events, eventSeq: app.get().eventSeq + 1, refusal: null });
  },
  refuse: (reason, target) => refuse(reason, target),
};

let session: GameSession | null = null;

export function getSession(): GameSession | null {
  return session;
}

/** Makes `next` the active session (closing the previous one); null leaves the game. */
export function setSession(next: GameSession | null): void {
  if (session !== next) session?.close();
  session = next;
}

/** True when this device may act for the player (always on one shared device). */
export function canAct(player: number | null): boolean {
  return session?.controls(player) ?? true;
}

/** The animation speed on this device (read reactively by the app root). */
export function useAnimationSpeed(): AnimationSpeed {
  const { game, mode } = useApp();
  usePrefs(); // online speed is a device preference: re-render when it changes
  return mode !== null && game && session ? session.animationSpeed() : 'normal';
}

export function setAnimationSpeed(speed: AnimationSpeed): void {
  session?.setAnimationSpeed(speed);
}

// ---------------------------------------------------------------------------------------------
// Commands

/** Sends an action through the session. Returns the refusal, if any, so the caller can shake. */
export function dispatch(action: Action, target: string | null = null): EngineError | null {
  if (!session || !app.get().game) return null;
  const error = session.dispatch(action, target);
  if (!error && session.mode === 'local') app.set({ hasSave: true });
  return error;
}

/** Shows a refusal reason without calling the engine (for UI-side checks such as an empty bid). */
export function refuse(reason: string, target: string | null = null): void {
  playCue('refuse');
  refusalSeq += 1;
  app.set({ refusal: { reason, seq: refusalSeq, target } });
}

export function clearRefusal(): void {
  if (app.get().refusal) app.set({ refusal: null });
}

export function startNewGame(settings: Partial<Settings>): void {
  const roundLimit = Number.isInteger(ROUNDS_PARAM) && ROUNDS_PARAM > 0 ? ROUNDS_PARAM : settings.roundLimit;
  const started = LocalSession.start(sessionHost, { ...settings, roundLimit }, newSeed());
  setSession(started.session);
  resetUi();
  app.set({
    screen: 'game',
    mode: 'local',
    game: started.game,
    events: [],
    eventSeq: app.get().eventSeq + 1,
    refusal: null,
    saveProblem: null,
    hasSave: true,
  });
}

/** Continue: restores the exact phase and pending decision, or reports a bad save. */
export function continueGame(): void {
  const { session: local, parsed } = LocalSession.resume(sessionHost);
  if (!parsed.ok) {
    app.set({ saveProblem: parsed.problem });
    return;
  }
  setSession(local);
  resetUi();
  app.set({
    screen: 'game',
    mode: 'local',
    game: parsed.state,
    events: [],
    eventSeq: app.get().eventSeq + 1,
    refusal: null,
    saveProblem: null,
  });
}

export function saveNow(): boolean {
  return session?.save() ?? false;
}

export function goTo(screen: Screen): void {
  resetUi();
  app.set({ screen, saveProblem: null, hasSave: readLocalSave() !== null });
}

export function dismissSaveProblem(): void {
  app.set({ saveProblem: null });
}

export function resetUi(): void {
  resetAnimation();
  ui.set({
    hover: null,
    pinned: null,
    sheet: null,
    confirm: null,
    rules: { open: false, topic: null },
    menuOpen: false,
    toast: null,
    logExpanded: false,
    quickHelp: null,
  });
}

export function showToast(text: string): void {
  toastSeq += 1;
  ui.set({ toast: { text, seq: toastSeq } });
}

export function openRules(topic: RuleTopicId | null = null): void {
  ui.set({ rules: { open: true, topic }, menuOpen: false, quickHelp: null });
}

export function closeRules(): void {
  ui.set({ rules: { open: false, topic: ui.get().rules.topic } });
}

export function openSheet(sheet: Sheet): void {
  ui.set({ sheet, menuOpen: false, quickHelp: null });
}

export function closeSheet(): void {
  ui.set({ sheet: null });
}

export function askConfirm(confirm: Confirm): void {
  ui.set({ confirm, menuOpen: false });
}

export function closeConfirm(): void {
  ui.set({ confirm: null });
}

// Read-only hook for end-to-end tests and debugging. It exposes no way to change the game.
if (typeof window !== 'undefined') {
  // Audio starts on the first input, so it listens before the skip handlers can swallow that input.
  installAudioUnlock();
  installSkipHandlers();
  const w = window as unknown as { __GM__?: Record<string, unknown> };
  w.__GM__ = Object.assign(w.__GM__ ?? {}, {
    getState: () => app.get().game,
    getScreen: () => app.get().screen,
  });
}
