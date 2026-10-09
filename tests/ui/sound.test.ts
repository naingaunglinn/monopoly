// @vitest-environment jsdom
// Sound effects (spec section 18): which event makes which sound across real bot games, the short
// version played when nothing animates, silent turn changes online, and that sound never breaks
// anything where Web Audio is missing (as here, in jsdom).
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createGame, decisionMaker, legalActions, reduce, type GameEvent, type GameState } from '../../src/engine';
import { BotRandom, chooseAction, isFreeAction, type BotKind } from '../../src/sim/bots';
import { finishNow, playBatch } from '../../src/ui/animation';
import { CUE_NAMES, CUES } from '../../src/ui/sound/cues';
import { playCue, stopSounds } from '../../src/ui/sound/engine';
import { cueFor, summarize, SUMMARY_LIMIT } from '../../src/ui/sound/plan';

interface Batch {
  prev: GameState;
  next: GameState;
  events: GameEvent[];
}

/** Every action of a few short bot games, with the state before and after. */
function botGames(seeds: number[]): Batch[] {
  const batches: Batch[] = [];
  for (const seed of seeds) {
    let s = createGame({ playerCount: 4, mode: 'quick', roundLimit: 15 }, seed);
    const rnd = new BotRandom(seed * 31 + 7);
    const kind: BotKind = seed % 2 === 0 ? 'sensible' : 'random';
    let freeCount = 0;
    for (let i = 0; i < 6000 && s.flow.phase !== 'GameOver'; i++) {
      const actor = decisionMaker(s) as number;
      const action = chooseAction(kind, { state: s, legal: legalActions(s), actor, rnd, freeActionsTaken: freeCount });
      freeCount = isFreeAction(action.type) ? freeCount + 1 : 0;
      const r = reduce(s, action);
      if (r.error) throw new Error(r.error.reason);
      batches.push({ prev: s, next: r.state, events: r.events });
      s = r.state;
    }
  }
  return batches;
}

const batches = botGames([3, 4, 5, 6]);
const local = { online: false };

afterEach(() => {
  finishNow();
  vi.useRealTimers();
});

describe('sounds for game events', () => {
  test('every cue exists, and every event makes a known sound or none', () => {
    for (const name of CUE_NAMES) expect(typeof CUES[name]).toBe('function');
    const used = new Set<string>();
    for (const b of batches) {
      for (const e of b.events) {
        const c = cueFor(e, local);
        if (c) {
          expect(CUE_NAMES).toContain(c.cue);
          used.add(c.cue);
        }
      }
    }
    // Real games reach the common sounds.
    for (const cue of ['dice', 'land', 'buy', 'rent', 'passStart', 'turn', 'bid', 'chance', 'event']) expect(used).toContain(cue);
  });

  test('buying, rent, building and trades make their own sound, not an extra coin sound', () => {
    for (const b of batches) {
      const cues = summarize(b.events, local).map((c) => c.cue);
      if (b.events.some((e) => e.type === 'bought')) expect(cues).not.toContain('loss');
      if (b.events.some((e) => e.type === 'rentPaid')) {
        expect(cues).toContain('rent');
        expect(cues).not.toContain('gain');
      }
      if (b.events.some((e) => e.type === 'tradeAccepted')) expect(cues).toContain('tradeYes');
    }
  });

  test('played at once: each sound once, a roll starts with the short rattle, at most four', () => {
    for (const b of batches) {
      const cues = summarize(b.events, local).map((c) => c.cue);
      expect(cues.length).toBeLessThanOrEqual(SUMMARY_LIMIT);
      expect(new Set(cues).size).toBe(cues.length);
      if (b.events[0]?.type === 'diceRolled') expect(cues[0]).toBe('diceQuick');
      expect(cues).not.toContain('dice');
    }
  });

  test('online, a turn change is silent (the device whose turn it is plays its own chime)', () => {
    const e: GameEvent = { type: 'turnStarted', player: 1 };
    expect(cueFor(e, { online: true })).toBeNull();
    expect(cueFor(e, local)).toEqual({ cue: 'turn' });
  });

  test('without Web Audio, sounds do nothing and never break playing a game', () => {
    vi.useFakeTimers();
    expect(() => playCue('dice', { ms: 1100 })).not.toThrow();
    expect(() => stopSounds()).not.toThrow();
    for (const b of batches.slice(0, 300)) {
      expect(() => playBatch(b.prev, b.next, b.events, 'normal')).not.toThrow();
      vi.advanceTimersByTime(10_000);
    }
  });
});
