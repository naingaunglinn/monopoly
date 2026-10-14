// Version 4 (the Myanmar map, D101): a version 3 save, and a room kept by the server from before, are
// on the World map and migrate without changing anything else.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { BOARD_SHAPE, BOARD_SIZE } from '../../src/data/balance';
import { MAP, setActiveMap } from '../../src/data/board';
import {
  checkInvariants,
  createGame,
  legalActions,
  normalizeSettings,
  parseSave,
  reduce,
  SCHEMA_VERSION,
  serializeGame,
  upgradeGame,
  type GameState,
} from '../../src/engine';
import { defaultRoomSettings, playable, type Room } from '../../server/room';

// tests/fixtures/save-v3.json was written by the version 3 build on the 60-space square World
// board: four players, houses, a mortgaged airport, an Event modifier and a trade on the table.
const v3Text = readFileSync(new URL('../fixtures/save-v3.json', import.meta.url), 'utf8');
const V3_BOARD_IN_PLAY = BOARD_SIZE === 60 && BOARD_SHAPE === 'square';

/** What version 4 adds to a version 3 game, taken back out. */
function withoutV4(s: GameState): unknown {
  const { economy: _economy, ...rest } = s;
  const { loan: _loan, ...flow } = s.flow;
  const { map: _map, ...settings } = s.meta.settings;
  return {
    ...rest,
    players: s.players.map(({ merit: _merit, draft: _draft, ...p }) => p),
    flow,
    meta: { ...s.meta, schemaVersion: 3, settings },
  };
}

describe('version 3 saves', () => {
  test.runIf(V3_BOARD_IN_PLAY)('a version 3 save loads on the World map as version 4, with nothing else changed', () => {
    const v3 = JSON.parse(v3Text);
    expect(v3.meta.schemaVersion).toBe(3);
    expect(v3.meta.settings.map).toBeUndefined();
    const parsed = parseSave(v3Text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const s = parsed.state;
    expect(SCHEMA_VERSION).toBe(4);
    expect(s.meta.schemaVersion).toBe(4);
    expect(s.meta.settings.map).toBe('world');
    expect(Object.keys(s.meta.settings)).toEqual(Object.keys(normalizeSettings()));
    expect(s.players.map((p) => [p.merit, p.draft])).toEqual(s.players.map(() => [0, null]));
    expect(s.economy).toEqual({ pot: 0, inflation: 0, loans: [], loanSeq: 0 });
    expect(s.flow.loan).toBeNull();
    expect(withoutV4(s)).toEqual(v3);
    expect(checkInvariants(s)).toEqual([]);
    // The trade on the table survived; the game plays on and saves as version 4.
    expect(s.flow.trade).not.toBeNull();
    const next = legalActions(s).find((a) => a.type === 'respondTrade' || a.type === 'roll');
    expect(next).toBeDefined();
    const step = reduce(s, (next?.type === 'respondTrade' ? { type: 'respondTrade', accept: false } : { type: 'roll' }) as never);
    expect(step.error).toBeNull();
    const again = parseSave(serializeGame(step.state));
    expect(again.ok && again.state.meta.schemaVersion).toBe(4);
  });

  test.runIf(V3_BOARD_IN_PLAY)('the server upgrades a kept version 3 game the same way', () => {
    const parsed = parseSave(v3Text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(upgradeGame(JSON.parse(v3Text) as GameState)).toEqual(parsed.state);
    // A current game is returned as it is; one from a newer version is refused.
    expect(upgradeGame(parsed.state)).toBe(parsed.state);
    expect(upgradeGame({ ...parsed.state, meta: { ...parsed.state.meta, schemaVersion: 5 } })).toBeNull();
  });

  test('checking a save leaves the map in play alone', () => {
    const worldSave = serializeGame(createGame({ map: 'world' }, 1));
    const myanmarSave = serializeGame(createGame({ map: 'myanmar' }, 1));
    setActiveMap('myanmar');
    try {
      parseSave(v3Text);
      expect(MAP.id).toBe('myanmar');
      parseSave(worldSave);
      expect(MAP.id).toBe('myanmar');
      setActiveMap('world');
      parseSave(myanmarSave);
      expect(MAP.id).toBe('world');
    } finally {
      setActiveMap('world');
    }
  });

  test('a Myanmar save loads as a Myanmar game; a damaged map is refused', () => {
    const s = createGame({ map: 'myanmar', playerCount: 3 }, 7);
    const parsed = parseSave(serializeGame(s));
    expect(parsed.ok && parsed.state.meta.settings.map).toBe('myanmar');
    const other = JSON.parse(serializeGame(s));
    other.meta.settings.map = 'mars';
    expect(parseSave(JSON.stringify(other)).ok).toBe(false);
    const short = JSON.parse(serializeGame(s));
    short.properties.pop();
    expect(parseSave(JSON.stringify(short))).toEqual({ ok: false, problem: 'corrupt' });
  });
});

describe('rooms kept from version 3', () => {
  const room = (game: GameState | null, settings: unknown): Room => ({
    code: 'ABCD',
    version: 3,
    createdAt: 1,
    updatedAt: 2,
    host: 0,
    seats: [],
    settings: settings as Room['settings'],
    game,
  });

  test('a lobby from before the Myanmar map is on the World map', () => {
    const { map: _map, ...old } = defaultRoomSettings();
    const read = playable(room(null, old));
    expect(read?.settings.map).toBe('world');
    expect(read?.settings).toEqual(defaultRoomSettings());
    // A room that already has its map is returned unchanged.
    const current = room(null, defaultRoomSettings());
    expect(playable(current)).toBe(current);
  });

  test.runIf(V3_BOARD_IN_PLAY)('a game from before the Myanmar map is migrated; one from another board is closed', () => {
    const { map: _map, ...old } = defaultRoomSettings();
    const v3 = JSON.parse(v3Text) as GameState;
    const read = playable(room(v3, old));
    expect(read?.game?.meta.schemaVersion).toBe(4);
    expect(read?.game?.meta.settings.map).toBe('world');
    expect(read && checkInvariants(read.game as GameState)).toEqual([]);
    const elsewhere = JSON.parse(v3Text);
    elsewhere.meta.settings.board = { spaces: 80, shape: 'rectangle' };
    expect(playable(room(elsewhere, old))).toBeNull();
  });
});
