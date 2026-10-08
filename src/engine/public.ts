// What every device in an online room may see (DECISIONS D58). The whole game is public, as on one
// shared table, except what would let a player predict the future: the seed, the generator state
// and the order of the face-down decks. Discard piles stay (those cards were shown to everyone).
// The client never runs the engine's reducer on this view; it only reads it.
import type { GameState } from './types.js';

export function publicView(s: GameState): GameState {
  return {
    ...s,
    decks: { ...s.decks, chanceDeck: [], eventDeck: [] },
    meta: { ...s.meta, seed: 0, rngState: 0, forcedDice: [], forcedCards: { chance: null, event: null } },
  };
}
