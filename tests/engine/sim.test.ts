// Smoke run of the simulation (the full 400-game run is `npm run sim`).
import { describe, expect, test } from 'vitest';
import { simulateGame, summarize } from '../../src/sim/runner';

describe('simulation smoke run', () => {
  test('seeded bot games finish with invariants checked after every action', () => {
    const results = [
      simulateGame(1, 'quick'),
      simulateGame(2, 'quick'),
      simulateGame(3, 'normal', { roundCap: 300 }),
      simulateGame(4, 'normal', { roundCap: 300 }),
    ];
    for (const r of results) {
      expect(r.finished || r.hitCap).toBe(true);
      expect(r.actions).toBeGreaterThan(50);
    }
    const quick = summarize(results.filter((r) => r.mode === 'quick'));
    expect(quick.games).toBe(2);
  });

  test('the same seed replays the same game', () => {
    expect(simulateGame(11, 'quick')).toEqual(simulateGame(11, 'quick'));
  });
});
