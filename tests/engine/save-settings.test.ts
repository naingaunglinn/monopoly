import { describe, expect, test } from 'vitest';
import {
  createGame,
  legalActions,
  normalizeSettings,
  parseSave,
  reduce,
  serializeGame,
  type Action,
  type GameState,
} from '../../src/engine';
import { mulberry32 } from '../../src/engine/rng';
import { act, cashOf, edit, endTurn, forceCard, game, own, rollTo } from './helpers';

/** Plays `steps` legal actions chosen by a seeded picker (deterministic). */
function autoplay(start: GameState, steps: number, pickSeed: number): { state: GameState; log: string[] } {
  let s = start;
  let r = pickSeed;
  const log: string[] = [];
  for (let i = 0; i < steps && s.flow.phase !== 'GameOver'; i++) {
    const legal = legalActions(s).filter((a) => a.type !== 'proposeTrade') as Action[];
    const next = mulberry32(r);
    r = next.next;
    const action = legal[Math.floor(next.value * legal.length)] as Action;
    const res = reduce(s, action);
    if (res.error) throw new Error(res.error.reason);
    log.push(JSON.stringify(res.events));
    s = res.state;
  }
  return { state: s, log };
}

describe('save and resume', () => {
  test('serialise then parse gives an identical state, mid-decision', () => {
    const states: GameState[] = [];
    let s = act(rollTo(game({ playerCount: 3 }), 9).state, { type: 'decline' });
    states.push(s); // auction pending
    s = act(s, { type: 'bid', amount: 50 });
    states.push(s);
    states.push(rollTo(forceCard(game(), 'chance-tour-guide'), 13).state); // card pending
    states.push(autoplay(createGame({ playerCount: 4 }, 99), 400, 5).state);
    for (const state of states) {
      const parsed = parseSave(serializeGame(state));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.state).toStrictEqual(state);
        expect(parsed.state.flow.phase).toBe(state.flow.phase);
        expect(parsed.state.flow.pending).toStrictEqual(state.flow.pending);
      }
    }
  });

  test('the same seed and the same actions give an identical game', () => {
    const a = autoplay(createGame({ playerCount: 4 }, 2024), 1500, 77);
    const b = autoplay(createGame({ playerCount: 4 }, 2024), 1500, 77);
    expect(a.state).toStrictEqual(b.state);
    expect(a.log).toEqual(b.log);
    const c = createGame({ playerCount: 4 }, 2025);
    expect(c.decks.chanceDeck).not.toEqual(createGame({ playerCount: 4 }, 2024).decks.chanceDeck);
  });

  test('a corrupt, older or newer save is reported and never throws', () => {
    const good = serializeGame(game());
    expect(parseSave(null)).toEqual({ ok: false, problem: 'corrupt' });
    expect(parseSave('')).toEqual({ ok: false, problem: 'corrupt' });
    expect(parseSave('{not json')).toEqual({ ok: false, problem: 'corrupt' });
    expect(parseSave(good.slice(0, good.length / 2))).toEqual({ ok: false, problem: 'corrupt' });
    expect(parseSave('[]')).toEqual({ ok: false, problem: 'corrupt' });
    const raw = JSON.parse(good);
    expect(parseSave(JSON.stringify({ ...raw, meta: { ...raw.meta, schemaVersion: 0 } }))).toEqual({
      ok: false,
      problem: 'older',
    });
    const noVersion = { ...raw, meta: { ...raw.meta } };
    delete noVersion.meta.schemaVersion;
    expect(parseSave(JSON.stringify(noVersion))).toEqual({ ok: false, problem: 'older' });
    expect(parseSave(JSON.stringify({ ...raw, meta: { ...raw.meta, schemaVersion: 2 } }))).toEqual({
      ok: false,
      problem: 'newer',
    });
    expect(parseSave(JSON.stringify({ ...raw, players: 'x' }))).toEqual({ ok: false, problem: 'corrupt' });
    const badOwner = JSON.parse(good);
    badOwner.properties[1].owner = 9;
    expect(parseSave(JSON.stringify(badOwner))).toEqual({ ok: false, problem: 'corrupt' });
    const badPhase = JSON.parse(good);
    badPhase.flow.phase = 'Lobby';
    expect(parseSave(JSON.stringify(badPhase))).toEqual({ ok: false, problem: 'corrupt' });
    expect(parseSave(good).ok).toBe(true);
  });
});

describe('settings', () => {
  test('starting money and player names', () => {
    const s = createGame({ playerCount: 3, startingMoney: 5000, playerNames: ['Mia', '  ', 'Leo'] }, 1);
    expect(s.players.map((p) => p.cash)).toEqual([5000, 5000, 5000]);
    expect(s.players.map((p) => p.name)).toEqual(['Mia', 'Player 2', 'Leo']);
    expect(s.players.map((p) => p.token)).toEqual(['globe', 'plane', 'compass']);
  });

  test('invalid options fall back to the defaults', () => {
    const n = normalizeSettings({ playerCount: 9, startingMoney: 123, roundLimit: 700 });
    expect(n).toMatchObject({ playerCount: 2, startingMoney: 4000, roundLimit: 50, mode: 'quick' });
    // Short round limits are accepted for tests (setup offers 30, 50 and 100).
    expect(normalizeSettings({ roundLimit: 5 }).roundLimit).toBe(5);
  });

  test('Free Stay off: no tokens, never offered, Free Stay cards pay $100', () => {
    let s = rollTo(own(game({ freeStay: false }), 12, 1), 12).state;
    expect(legalActions(s).map((a) => a.type)).toEqual(['payRent']);
    s = rollTo(forceCard(game({ freeStay: false }), 'chance-friendly-host'), 13).state;
    s = act(s, { type: 'confirmCard' });
    expect(s.players[0]?.freeStay).toBe(0);
    expect(cashOf(s, 0)).toBe(4100);
  });

  test('Vacation off: the space does nothing and Go to Vacation cards are removed', () => {
    const s = rollTo(game({ vacation: false }), 40).state;
    expect(s.players[0]?.skipNextTurn).toBe(false);
    expect(s.flow.notices).toEqual([]);
    expect(s.decks.chanceDeck).not.toContain('chance-beach-calling');
    expect(game().decks.chanceDeck).toContain('chance-beach-calling');
  });

  test('Auction off: passing leaves the property unowned', () => {
    const s = act(rollTo(game({ auction: false }), 9).state, { type: 'decline' });
    expect(s.flow.phase).toBe('AwaitEndTurn');
    expect(s.properties[9]?.owner).toBeNull();
  });

  test('Chance off and Event off: those spaces do nothing', () => {
    const chance = rollTo(game({ chance: false }), 13).state;
    expect(chance.flow.phase).toBe('AwaitEndTurn');
    const event = rollTo(game({ event: false }), 19).state;
    expect(event.flow.phase).toBe('AwaitEndTurn');
    expect(rollTo(game(), 13).state.flow.phase).toBe('CardReveal');
  });

  test('random first player', () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      firsts.add(createGame({ playerCount: 4, randomFirstPlayer: true }, seed).turn.currentPlayerIndex);
    }
    expect(firsts.size).toBeGreaterThan(1);
    for (let seed = 1; seed <= 10; seed++) expect(createGame({ playerCount: 4 }, seed).turn.currentPlayerIndex).toBe(0);
  });

  test('a random first player opens every round', () => {
    let s: GameState | null = null;
    for (let seed = 1; seed < 100 && !s; seed++) {
      const g = createGame({ playerCount: 3, randomFirstPlayer: true, passDevice: false }, seed);
      if (g.turn.currentPlayerIndex === 2) s = g;
    }
    if (!s) throw new Error('no seed with player 3 first');
    expect(s.turn.roundStartSeat).toBe(2);
    for (let i = 0; i < 3; i++) s = act(rollTo(s, 34).state, { type: 'endTurn' });
    expect(s.turn.currentPlayerIndex).toBe(2);
    expect(s.turn.roundNumber).toBe(2);
  });

  test('pass-device screen on: shown at each turn start, never on a doubles re-roll', () => {
    let s = createGame({ passDevice: true, auction: false }, 3);
    expect(s.flow.phase).toBe('PassDevice');
    s = act(s, { type: 'ready' });
    expect(s.flow.phase).toBe('AwaitRoll');
    s = act(s, { type: 'debug', op: 'movePlayer', player: 0, space: 3 }, { type: 'debug', op: 'setNextDice', dice: [3, 3] });
    s = act(s, { type: 'roll' }); // 9: Mexico Airport
    s = act(s, { type: 'decline' });
    expect(s.flow.phase).toBe('AwaitRoll');
    s = act(s, { type: 'debug', op: 'setNextDice', dice: [12 - 9 - 1, 1] }, { type: 'roll' }); // to 12
    s = act(s, { type: 'decline' });
    s = act(s, { type: 'endTurn' });
    expect(s.flow.phase).toBe('PassDevice');
    expect(s.turn.currentPlayerIndex).toBe(1);
  });

  test('pass-device screen off, and switching it during a game', () => {
    expect(game().flow.phase).toBe('AwaitRoll');
    let s = createGame({ passDevice: true }, 3);
    s = act(s, { type: 'setPassDevice', on: false });
    expect(s.meta.settings.passDevice).toBe(false);
    expect(s.flow.phase).toBe('AwaitRoll');
    s = endTurn(rollTo(s, 34).state);
    expect(s.flow.phase).toBe('AwaitRoll');
    s = act(s, { type: 'setPassDevice', on: true });
    s = endTurn(rollTo(s, 34).state);
    expect(s.flow.phase).toBe('PassDevice');
  });

  test('animation speed is stored and changes nothing else', () => {
    const s = game();
    const after = act(s, { type: 'setAnimationSpeed', speed: 'off' });
    expect(after.meta.settings.animationSpeed).toBe('off');
    expect(after.players).toEqual(s.players);
    expect(after.flow).toEqual(s.flow);
  });

  test('Quick or Normal mode and the round limit are kept', () => {
    expect(game({ mode: 'normal' }).meta.settings.mode).toBe('normal');
    expect(game({ roundLimit: 100 }).meta.settings.roundLimit).toBe(100);
    expect(edit(game(), () => undefined).meta.settings.mode).toBe('quick');
  });
});
