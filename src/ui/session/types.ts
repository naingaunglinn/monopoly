// A game session is how the screens play: on one shared device (LocalSession) or in a room on the
// server (OnlineSession). Screens never call the engine or the network directly; they read the
// game from the app store and send every action through the active session.
import type { Action, AnimationSpeed, EngineError, GameEvent, GameState } from '../../engine';

export type SessionMode = 'local' | 'online';

export interface GameSession {
  readonly mode: SessionMode;
  /**
   * Sends an action. Local: applied at once. Online: sent to the server, which is the authority;
   * the new state arrives as an update. Returns the refusal to show, or null.
   */
  dispatch(action: Action, target: string | null): EngineError | null;
  /** True when this device may act for this player (locally everyone shares the device). */
  controls(player: number | null): boolean;
  /** Animation speed on this device. */
  animationSpeed(): AnimationSpeed;
  setAnimationSpeed(speed: AnimationSpeed): void;
  /** Saves now; false when storage failed. Online games are saved by the server. */
  save(): boolean;
  /** Stops timers and connections when the player leaves the game. */
  close(): void;
}

/** What a session needs from the app: the current game, and a way to show a new one. */
export interface SessionHost {
  game(): GameState | null;
  /** Plays the events on top of `prev` and shows `next` (both sessions animate the same way). */
  show(prev: GameState | null, next: GameState, events: GameEvent[], speed: AnimationSpeed): void;
  /** Shows a refusal reason (the target button shakes). */
  refuse(reason: string, target: string | null): void;
}
