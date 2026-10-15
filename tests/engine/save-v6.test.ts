// Version 6 (D115): a version 5 save, and a room kept by the server from before, gain the general
// house rule, switched on as before. An unrest window that was open keeps its target; the money it
// takes follows the new rule (10% of the target's cash, from 300 to 1,500 lakh).
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { MYANMAR } from '../../src/data/balance';
import { checkInvariants, parseSave, reduce, SCHEMA_VERSION, serializeGame, upgradeGame, type GameState } from '../../src/engine';

// tests/fixtures/save-v5.json was written by the version 5 build: a Myanmar game whose general
// (player 0, rank 4) rolled the money power on player 2 (2,500 lakh); the unrest window is open.
const v5Text = readFileSync(new URL('../fixtures/save-v5.json', import.meta.url), 'utf8');

describe('version 5 saves', () => {
  test('load as the current version with the general on; nothing else changes', () => {
    const v5 = JSON.parse(v5Text);
    expect(v5.meta.schemaVersion).toBe(5);
    expect('general' in v5.meta.settings).toBe(false);
    const parsed = parseSave(v5Text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const s = parsed.state;
    expect(SCHEMA_VERSION).toBe(6);
    expect(s.meta.schemaVersion).toBe(6);
    expect(s.meta.settings.general).toBe(true);
    expect({ ...s, meta: { ...s.meta, schemaVersion: 5, settings: { ...s.meta.settings, general: undefined } } }).toEqual({
      ...v5,
      meta: { ...v5.meta, settings: { ...v5.meta.settings, general: undefined } },
    });
    expect(checkInvariants(s)).toEqual([]);
    // Saved again, it loads again unchanged.
    const again = parseSave(serializeGame(s));
    expect(again.ok && again.state).toEqual(s);
  });

  test('the open window keeps its target, who pays by the new rule', () => {
    const parsed = parseSave(v5Text);
    if (!parsed.ok) throw new Error('not loaded');
    let s: GameState = parsed.state;
    expect(s.flow.pending).toMatchObject({ kind: 'unrest', target: 2, waiting: [1, 2, 3] });
    const before = s.players.map((p) => p.cash);
    for (const player of [1, 2, 3]) {
      const r = reduce(s, { type: 'unrestAnswer', player, use: false, block: false });
      expect(r.error).toBeNull();
      s = r.state;
    }
    // 10% of 2,500 is 250: the least the power takes is 300.
    expect(MYANMAR.powerMoneyMin).toBe(300);
    expect(s.players[2]?.cash).toBe((before[2] as number) - 300);
    expect(s.players[0]?.cash).toBe((before[0] as number) + 300);
    expect(checkInvariants(s)).toEqual([]);
  });

  test('a room the server kept from version 5 is brought up to date', () => {
    const v5 = JSON.parse(v5Text);
    const up = upgradeGame(v5) as GameState;
    expect(up.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(up.meta.settings.general).toBe(true);
  });
});
