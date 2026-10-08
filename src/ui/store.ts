// The UI side of the game: holds the current GameState, sends actions to the pure engine,
// autosaves after every action and keeps UI-only state (overlays, focus, feedback).
// Components read it with useSyncExternalStore; nothing here is game logic.
import { useSyncExternalStore } from 'react';
import {
  createGame,
  parseSave,
  reduce,
  SAVE_KEY,
  serializeGame,
  type Action,
  type EngineError,
  type GameEvent,
  type GameState,
  type SaveProblem,
  type Settings,
} from '../engine';
import type { RuleTopicId } from './strings';

export type Screen = 'start' | 'setup' | 'game';

export interface AppState {
  screen: Screen;
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
const ROUNDS_PARAM = Number(search.get('rounds'));

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

function storageGet(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function storageSet(text: string): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Stores

export const app = new Store<AppState>({
  screen: 'start',
  game: null,
  events: [],
  eventSeq: 0,
  refusal: null,
  saveProblem: null,
  hasSave: storageGet() !== null,
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
// Commands

/** Sends an action to the engine. Returns the refusal, if any, so the caller can shake. */
export function dispatch(action: Action, target: string | null = null): EngineError | null {
  const game = app.get().game;
  if (!game) return null;
  const result = reduce(game, action);
  if (result.error) {
    refusalSeq += 1;
    app.set({ refusal: { reason: result.error.reason, seq: refusalSeq, target } });
    return result.error;
  }
  storageSet(serializeGame(result.state));
  app.set({ game: result.state, events: result.events, eventSeq: app.get().eventSeq + 1, refusal: null, hasSave: true });
  return null;
}

/** Shows a refusal reason without calling the engine (for UI-side checks such as an empty bid). */
export function refuse(reason: string, target: string | null = null): void {
  refusalSeq += 1;
  app.set({ refusal: { reason, seq: refusalSeq, target } });
}

export function clearRefusal(): void {
  if (app.get().refusal) app.set({ refusal: null });
}

export function startNewGame(settings: Partial<Settings>): void {
  const roundLimit = Number.isInteger(ROUNDS_PARAM) && ROUNDS_PARAM > 0 ? ROUNDS_PARAM : settings.roundLimit;
  const game = createGame({ ...settings, roundLimit }, newSeed());
  storageSet(serializeGame(game));
  resetUi();
  app.set({ screen: 'game', game, events: [], eventSeq: app.get().eventSeq + 1, refusal: null, saveProblem: null, hasSave: true });
}

/** Continue: restores the exact phase and pending decision, or reports a bad save. */
export function continueGame(): void {
  const parsed = parseSave(storageGet());
  if (!parsed.ok) {
    app.set({ saveProblem: parsed.problem });
    return;
  }
  resetUi();
  app.set({ screen: 'game', game: parsed.state, events: [], eventSeq: app.get().eventSeq + 1, refusal: null, saveProblem: null });
}

export function saveNow(): boolean {
  const game = app.get().game;
  if (!game) return false;
  return storageSet(serializeGame(game));
}

export function goTo(screen: Screen): void {
  resetUi();
  app.set({ screen, saveProblem: null, hasSave: storageGet() !== null });
}

export function dismissSaveProblem(): void {
  app.set({ saveProblem: null });
}

export function resetUi(): void {
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
  (window as unknown as { __GM__: unknown }).__GM__ = {
    getState: () => app.get().game,
    getScreen: () => app.get().screen,
  };
}
