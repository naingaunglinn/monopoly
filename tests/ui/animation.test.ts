// @vitest-environment jsdom
// Animation pacing (D51) and reduced motion (D52): how long the player shows a move, that Fast
// halves it and Off skips it, and that Show movement anyway overrides the device's reduced motion.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createGame, reduce, type Action, type GameState } from '../../src/engine';
import { DURATIONS, finishNow, playBatch, prefersReducedMotion, stepMs } from '../../src/ui/animation';
import { getDisplay } from '../../src/ui/display';
import { setPrefs } from '../../src/ui/prefs';

function act(s: GameState, a: Action) {
  const r = reduce(s, a);
  if (r.error) throw new Error(r.error.reason);
  return r;
}

/** Player 1 rolls a 7 from space 3 to space 10. */
function roll(): { prev: GameState; next: GameState; events: ReturnType<typeof act>['events'] } {
  let s = createGame({ passDevice: false }, 7);
  s = act(s, { type: 'debug', op: 'movePlayer', player: 0, space: 3 }).state;
  s = act(s, { type: 'debug', op: 'setNextDice', dice: [3, 4] }).state;
  const r = act(s, { type: 'roll' });
  return { prev: s, next: r.state, events: r.events };
}

function reducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  finishNow();
  setPrefs({ motionAnyway: false });
  reducedMotion(false);
  vi.useRealTimers();
});

describe('animation pacing', () => {
  test('a dice move is shown space by space, slow enough to follow', () => {
    expect(stepMs(7)).toBe(260);
    expect(stepMs(12)).toBe(260);
    // Long card moves shorten each step so the whole move stays near 4 s.
    expect(stepMs(40) * 40).toBeLessThanOrEqual(DURATIONS.moveBudget + 40);
    expect(stepMs(79)).toBe(DURATIONS.minStep);
    expect(stepMs(79) * 79).toBeLessThan(6000);
  });

  test('Normal plays dice, seven hops and the landing; Fast halves it; Off is instant', () => {
    vi.useFakeTimers();
    reducedMotion(false);
    const { prev, next, events } = roll();
    const normal = playBatch(prev, next, events, 'normal');
    expect(normal).toBeGreaterThanOrEqual(DURATIONS.dice + 7 * DURATIONS.step + DURATIONS.landing);
    expect(getDisplay().busy).toBe(true);
    // Midway through the move the token is on the way, hopping, with the path lit.
    vi.advanceTimersByTime(DURATIONS.dice + 3 * DURATIONS.step + 10);
    const d = getDisplay();
    expect(d.positions?.[0]).toBe(7);
    expect(d.hop).toMatchObject({ player: 0, ms: DURATIONS.step, last: false });
    expect(d.lit).toEqual([7, 6]);
    expect(d.mover).toBe(0);
    finishNow();
    expect(getDisplay().busy).toBe(false);
    const fast = playBatch(prev, next, events, 'fast');
    expect(fast).toBeGreaterThanOrEqual(Math.floor(normal / 2) - 5);
    expect(fast).toBeLessThanOrEqual(Math.ceil(normal / 2) + 5);
    finishNow();
    expect(playBatch(prev, next, events, 'off')).toBe(0);
  });

  test('reduced motion stops movement unless Show movement anyway is on', () => {
    vi.useFakeTimers();
    const { prev, next, events } = roll();
    reducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(playBatch(prev, next, events, 'normal')).toBe(0);
    setPrefs({ motionAnyway: true });
    expect(prefersReducedMotion()).toBe(false);
    expect(playBatch(prev, next, events, 'normal')).toBeGreaterThan(DURATIONS.dice);
    expect(JSON.parse(window.localStorage.getItem('global-monopoly/prefs/v1') as string)).toEqual({ motionAnyway: true });
  });
});
