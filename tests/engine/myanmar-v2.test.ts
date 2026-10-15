// The Myanmar map's spec v2, stages 1 and 2 (D106): Chiang Mai, Brycen Myanmar and its five-tier
// rent, the porter card, Brycen Myanmar's loss and the Porters news. Spaces are found by name.
import { describe, expect, test } from 'vitest';
import { MYANMAR } from '../../src/data/balance';
import { SPACES } from '../../src/data/board';
import { cardsForSettings, fleeSpace, legalActions, parseSave, serializeGame, validateAction, type GameState } from '../../src/engine';
import { act, cashOf, edit, endTurn, eventsOf, forceCard, game, own, rollTo, run, setCash, spaceOf, spacesOf } from './helpers';

const mm = (settings: Parameters<typeof game>[0] = {}, seed = 7) => game({ map: 'myanmar', playerCount: 3, ...settings }, seed);
type P = GameState['players'][number];

describe('stage 1 of spec v2', () => {
  test('fleeing military service goes to Chiang Mai, without taking the pot', () => {
    const s = edit(rollTo(setCash(mm(), 0, 3000), SPACES.goToJail).state, (d) => void (d.economy.pot = 900));
    const { state, events } = run(s, { type: 'draftChoose', how: 'flee' });
    expect(fleeSpace()).toBe(SPACES.vacation);
    expect(state.players[0]?.position).toBe(SPACES.vacation);
    expect(eventsOf(events, 'potTaken')).toEqual([]);
    expect(state.economy.pot).toBe(900 + MYANMAR.draftFleeCost);
  });

  test('the new cards are in the Myanmar decks', () => {
    const settings = mm().meta.settings;
    expect(cardsForSettings('chance', settings).map((c) => c.id)).toEqual(expect.arrayContaining(['mm-chance-porter', 'mm-chance-brycen-loss']));
    expect(cardsForSettings('event', settings).map((c) => c.id)).toContain('mm-event-porter-hunt');
  });
});

describe('the porter card', () => {
  // A Chance space reached without passing Start.
  const chance = () => (mm(), spacesOf('chance')[1] as number);

  test('to the Military camp, 500 lakh into the pot, the turn ends; no other way out, no merit', () => {
    const withMerit = edit(mm(), (d) => {
      (d.players[0] as P).merit = 3;
      (d.players[0] as P).jailCards = [];
    });
    const s = rollTo(forceCard(withMerit, 'mm-chance-porter'), chance()).state;
    // A merit point cannot cancel it.
    expect(validateAction(s, { type: 'useMerit' })?.code).toBe('wrongPhase');
    const before = cashOf(s, 0);
    const { state, events } = run(s, { type: 'confirmCard' });
    expect(state.players[0]?.position).toBe(SPACES.jail);
    expect(state.players[0]?.draft).toBeNull();
    expect(cashOf(state, 0)).toBe(before - 500);
    expect(state.economy.pot).toBe(500);
    expect(state.flow.phase).toBe('AwaitEndTurn');
    expect(eventsOf(events, 'passedStart')).toEqual([]);
    expect(legalActions(state).some((a) => a.type === 'draftChoose')).toBe(false);
  });

  test('a player short of 500 raises the money or goes bankrupt; never stuck', () => {
    const falam = spaceOf('Falam');
    const s = rollTo(forceCard(own(setCash(mm({ mode: 'normal' }), 0, 100), falam, 0), 'mm-chance-porter'), chance()).state;
    const owed = act(s, { type: 'confirmCard' });
    expect(owed.flow.phase).toBe('Debt');
    const broke = rollTo(forceCard(setCash(mm({ mode: 'normal' }), 0, 100), 'mm-chance-porter'), chance()).state;
    const out = run(broke, { type: 'confirmCard' });
    expect(eventsOf(out.events, 'bankrupt')).toHaveLength(1);
  });
});

describe('Brycen Myanmar posts a loss', () => {
  const chance = () => (mm(), spacesOf('chance')[0] as number);
  const brycen = () => (mm(), spaceOf('Brycen Myanmar (IT company)'));

  test('every other player pays the owner 100 lakh', () => {
    const s = rollTo(forceCard(own(mm(), brycen(), 2), 'mm-chance-brycen-loss'), chance()).state;
    const after = act(s, { type: 'confirmCard' });
    expect([0, 1, 2].map((p) => cashOf(after, p) - cashOf(s, p))).toEqual([-100, -100, 200]);
  });

  test('the drawer owns it: they collect from the rest', () => {
    const s = rollTo(forceCard(own(mm(), brycen(), 0), 'mm-chance-brycen-loss'), chance()).state;
    const after = act(s, { type: 'confirmCard' });
    expect([0, 1, 2].map((p) => cashOf(after, p) - cashOf(s, p))).toEqual([200, -100, -100]);
  });

  test('nobody owns it: every player puts 100 lakh into the pot', () => {
    const s = rollTo(forceCard(mm(), 'mm-chance-brycen-loss'), chance()).state;
    const after = act(s, { type: 'confirmCard' });
    expect([0, 1, 2].map((p) => cashOf(after, p) - cashOf(s, p))).toEqual([-100, -100, -100]);
    expect(after.economy.pot).toBe(300);
  });
});

describe('Porters wanted', () => {
  const news = () => (mm(), spacesOf('event')[0] as number);

  /** Draws the card with the generator set so that `seat` is picked (among `free` players). */
  function drawPicking(s: GameState, seat: number): GameState {
    const drawn = rollTo(forceCard(s, 'mm-event-porter-hunt'), news()).state;
    for (let rng = 1; rng < 5000; rng++) {
      const tried = edit(drawn, (d) => void (d.meta.rngState = rng));
      const out = act(tried, { type: 'confirmCard' });
      const picked = out.players.findIndex((p) => p.draft !== null || out.flow.pending?.kind === 'draftChoice' && p.id === out.turn.currentPlayerIndex);
      if (picked === seat) return out;
    }
    throw new Error('no generator state picks that seat');
  }

  test('someone else: to the camp now, no rent meanwhile, and they choose at their next turn', () => {
    const mandalay = (mm(), spaceOf('Mandalay'));
    const s = drawPicking(own(mm(), mandalay, 1), 1);
    expect(s.players[1]).toMatchObject({ position: SPACES.jail, draft: { status: 'called', turns: 1 } });
    // Rent owed to a called-up player is not collected.
    let t = endTurn(s);
    expect(t.flow).toMatchObject({ phase: 'TurnStart', pending: { kind: 'draftChoice' } });
    expect(t.turn.currentPlayerIndex).toBe(1);
    // Paying at the turn start: free, and the turn is played.
    t = act(t, { type: 'draftChoose', how: 'pay' });
    expect(t.flow.phase).toBe('AwaitRoll');
    expect(t.players[1]?.draft).toBeNull();
  });

  test('choosing to hide at the turn start counts that turn as the first one skipped', () => {
    const s = endTurn(drawPicking(mm(), 1));
    const hid = run(s, { type: 'draftChoose', how: 'hide' });
    expect(hid.state.players[1]?.draft).toEqual({ status: 'hiding', turns: MYANMAR.draftHideTurns - 1 });
    expect(hid.state.turn.currentPlayerIndex).toBe(2);
    expect(eventsOf(hid.events, 'turnSkipped')).toHaveLength(1);
  });

  test('the drawer: called up at once, with the usual choice', () => {
    const s = drawPicking(mm(), 0);
    expect(s.flow).toMatchObject({ phase: 'TurnStart', pending: { kind: 'draftChoice' } });
    expect(s.players[0]?.position).toBe(SPACES.jail);
  });

  test('players already in service are never picked; with nobody free it does nothing', () => {
    const allIn = edit(mm(), (d) => {
      for (const p of d.players) p.draft = { status: 'hiding', turns: 2 };
      (d.players[0] as P).draft = null;
    });
    const s = drawPicking(allIn, 0);
    expect(s.players[0]?.position).toBe(SPACES.jail);
    const none = edit(mm(), (d) => {
      for (const p of d.players.slice(1)) p.draft = { status: 'hiding', turns: 2 };
    });
    // Only the drawer is free: picked every time.
    expect(drawPicking(none, 0).flow.pending).toEqual({ kind: 'draftChoice' });
  });

  test('a called-up player survives a save and a load', () => {
    const s = drawPicking(mm(), 1);
    const parsed = parseSave(serializeGame(s));
    expect(parsed.ok && parsed.state).toEqual(s);
  });
});
