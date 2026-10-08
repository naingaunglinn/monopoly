// LocalSession: the one-device game. Actions run through the pure engine at once, the game is
// autosaved to localStorage after every action, and the events are animated.
import {
  createGame,
  parseSave,
  reduce,
  SAVE_KEY,
  serializeGame,
  type Action,
  type AnimationSpeed,
  type GameState,
  type ParseResult,
  type Settings,
} from '../../engine';
import type { GameSession, SessionHost } from './types';

export function readLocalSave(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function writeLocalSave(game: GameState): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, serializeGame(game));
    return true;
  } catch {
    return false;
  }
}

export class LocalSession implements GameSession {
  readonly mode = 'local' as const;

  constructor(private readonly host: SessionHost) {}

  /** A new game, saved at once. */
  static start(host: SessionHost, settings: Partial<Settings>, seed: number): { session: LocalSession; game: GameState } {
    const game = createGame(settings, seed);
    writeLocalSave(game);
    return { session: new LocalSession(host), game };
  }

  /** The saved game, or the reason it cannot be loaded. */
  static resume(host: SessionHost): { session: LocalSession; parsed: ParseResult } {
    return { session: new LocalSession(host), parsed: parseSave(readLocalSave()) };
  }

  dispatch(action: Action, target: string | null) {
    const game = this.host.game();
    if (!game) return null;
    const result = reduce(game, action);
    if (result.error) {
      this.host.refuse(result.error.reason, target);
      return result.error;
    }
    writeLocalSave(result.state);
    this.host.show(game, result.state, result.events, result.state.meta.settings.animationSpeed);
    return null;
  }

  controls(): boolean {
    return true;
  }

  animationSpeed(): AnimationSpeed {
    return this.host.game()?.meta.settings.animationSpeed ?? 'normal';
  }

  setAnimationSpeed(speed: AnimationSpeed): void {
    this.dispatch({ type: 'setAnimationSpeed', speed }, null);
  }

  save(): boolean {
    const game = this.host.game();
    return game ? writeLocalSave(game) : false;
  }

  close(): void {
    // Nothing to stop: the game lives in this tab and in localStorage.
  }
}
