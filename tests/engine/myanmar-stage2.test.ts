// The Myanmar map, stage 2 (owner's spec 7.1 to 7.4, D102): military service, merit, the company
// events and inflation. Spaces are found by name; corners come from SPACES.
import { describe, expect, test } from 'vitest';
import { MYANMAR } from '../../src/data/balance';
import { SPACES } from '../../src/data/board';
import {
  fleeSpace,
  cityRent,
  companyRent,
  draftPayCost,
  legalActions,
  legalActionsFor,
  parseSave,
  serializeGame,
  validateAction,
  type Action,
  type GameState,
} from '../../src/engine';
import { act, cashOf, edit, endTurn, eventsOf, fail, forceCard, game, own, rollTo, rollWith, run, setCash, spaceOf, spacesOf, at, nextDice } from './helpers';

const mm = (settings: Parameters<typeof game>[0] = {}, seed = 7) => game({ map: 'myanmar', playerCount: 3, ...settings }, seed);

/** Player 0 lands on the Call-up letter corner and must choose. */
function calledUp(s: GameState = mm()): GameState {
  const r = rollTo(s, SPACES.goToJail).state;
  expect(r.flow.phase).toBe('TurnStart');
  expect(r.flow.pending).toEqual({ kind: 'draftChoice' });
  expect(r.players[0]?.position).toBe(SPACES.jail);
  return r;
}

const choices = (s: GameState) =>
  legalActions(s)
    .filter((a): a is Extract<Action, { type: 'draftChoose' }> => a.type === 'draftChoose')
    .map((a) => a.how);

/** Ends the current player's turn and plays the others' turns until player 0 is up again. */
function backToPlayer0(s: GameState): GameState {
  let state = endTurn(s);
  for (let i = 0; i < 6 && state.turn.currentPlayerIndex !== 0; i++) {
    if (state.flow.phase === 'TurnStart') state = act(state, { type: 'acknowledge' });
    else state = endTurn(rollTo(state, SPACES.jail).state);
  }
  return state;
}

describe('military service (spec 7.1)', () => {
  test('the Call-up letter sends the player to the Military camp to choose; free choices are always there', () => {
    const s = calledUp(setCash(mm(), 0, 100));
    expect(choices(s)).toEqual(['hide', 'serve']);
    const rich = calledUp(setCash(mm(), 0, 9000));
    expect(choices(rich)).toEqual(['pay', 'hide', 'flee', 'serve']);
    expect(fail(rich, { type: 'draftChoose', how: 'merit' }).code).toBe('noMerit');
    expect(fail(rich, { type: 'roll' }).code).toBe('wrongPhase');
  });

  test('pay: a tenth of the cash, at least 500 lakh, and free at once', () => {
    expect(draftPayCost(4000)).toBe(500);
    expect(draftPayCost(8000)).toBe(800);
    const s = calledUp(setCash(mm(), 0, 8000));
    const { state, events } = run(s, { type: 'draftChoose', how: 'pay' });
    expect(cashOf(state, 0)).toBe(7200);
    expect(state.players[0]?.draft).toBeNull();
    expect(state.flow.phase).toBe('AwaitEndTurn');
    expect(eventsOf(events, 'draftChosen')).toEqual([{ type: 'draftChosen', player: 0, how: 'pay', cost: 800 }]);
  });

  test('hide: two turns skipped; rent still comes in meanwhile (D109)', () => {
    const mandalay = (mm(), spaceOf('Mandalay'));
    let s = act(calledUp(own(mm(), mandalay, 0)), { type: 'draftChoose', how: 'hide' });
    expect(s.players[0]?.draft).toEqual({ status: 'hiding', turns: 2 });
    s = endTurn(s);
    // Player 1 lands on the hiding player's city: rent is due as usual.
    const landed = rollTo(s, mandalay);
    expect(eventsOf(landed.events, 'rentWaived')).toEqual([]);
    expect(landed.state.flow.pending).toMatchObject({ kind: 'rent', rent: { creditor: 0, amount: 74 } });
    s = endTurn(act(landed.state, { type: 'payRent' }));
    s = endTurn(rollTo(s, SPACES.jail).state);
    // Player 0's first skipped turn, then the second; then free.
    expect(s.flow.pending).toEqual({ kind: 'draftSkip' });
    s = act(s, { type: 'acknowledge' });
    expect(s.players[0]?.draft).toEqual({ status: 'hiding', turns: 1 });
    s = backToPlayer0(rollTo(s, SPACES.jail).state);
    expect(s.flow.pending).toEqual({ kind: 'draftSkip' });
    const done = run(s, { type: 'acknowledge' });
    expect(done.state.players[0]?.draft).toBeNull();
    expect(eventsOf(done.events, 'draftEnded')).toEqual([{ type: 'draftEnded', player: 0, how: 'done', bonus: 0 }]);
  });

  test('serve: three turns skipped, then 300 lakh (and, since spec v2, rank and a salary)', () => {
    let s = act(calledUp(), { type: 'draftChoose', how: 'serve' });
    expect(s.players[0]?.draft).toEqual({ status: 'serving', turns: 3 });
    s = edit(s, (d) => {
      (d.players[0] as GameState['players'][number]).draft = { status: 'serving', turns: 1 };
    });
    s = backToPlayer0(s);
    const cash = cashOf(s, 0);
    const done = run(s, { type: 'acknowledge' });
    const salary = eventsOf(done.events, 'promoted')[0]?.salary ?? 0;
    expect(salary).toBeGreaterThan(0);
    expect(cashOf(done.state, 0)).toBe(cash + MYANMAR.draftServeBonus + salary);
    expect(eventsOf(done.events, 'draftEnded')[0]?.bonus).toBe(300);
  });

  test('flee: 800 lakh, straight to Chiang Mai (no Start money), rent still comes in', () => {
    const mandalay = (mm(), spaceOf('Mandalay'));
    const s = calledUp(own(setCash(mm(), 0, 2000), mandalay, 0));
    const { state, events } = run(s, { type: 'draftChoose', how: 'flee' });
    expect(cashOf(state, 0)).toBe(1200);
    expect(state.players[0]?.position).toBe(fleeSpace());
    expect(state.players[0]?.draft).toEqual({ status: 'fled', turns: 1 });
    expect(eventsOf(events, 'passedStart')).toEqual([]);
    const landed = rollTo(endTurn(state), mandalay).state;
    expect(landed.flow.pending).toMatchObject({ kind: 'rent', rent: { creditor: 0, amount: 74 } });
  });

  test('a merit point or the Call-up exemption card frees the player at once, also at a skipped turn', () => {
    const withMerit = edit(mm(), (d) => {
      (d.players[0] as GameState['players'][number]).merit = 1;
    });
    const s = calledUp(withMerit);
    expect(choices(s)).toContain('merit');
    const freed = act(s, { type: 'draftChoose', how: 'merit' });
    expect(freed.players[0]).toMatchObject({ merit: 0, draft: null });

    // Hiding, then the exemption card at the next turn: the turn is played.
    let hiding = act(calledUp(withMerit), { type: 'draftChoose', how: 'hide' });
    hiding = backToPlayer0(hiding);
    expect(legalActions(hiding)).toContainEqual({ type: 'leaveDraft', how: 'merit' });
    const out = act(hiding, { type: 'leaveDraft', how: 'merit' });
    expect(out.flow.phase).toBe('AwaitRoll');
    expect(out.players[0]).toMatchObject({ merit: 0, draft: null });
  });

  test('three doubles and the conscription card call the player up too', () => {
    // Two doubles already rolled this turn: the third calls the player up before moving.
    const s = edit(at(mm(), 0, 1), (d) => {
      d.turn.doublesCount = 2;
    });
    const third = rollWith(s, 2, 2);
    expect(third.state.flow.pending).toEqual({ kind: 'draftChoice' });
    expect(eventsOf(third.events, 'jailed')[0]?.reason).toBe('doubles');

    const chance = spacesOf('chance')[0] as number;
    const card = act(rollTo(forceCard(mm(), 'mm-chance-call-up'), chance).state, { type: 'confirmCard' });
    expect(card.flow.pending).toEqual({ kind: 'draftChoice' });
  });

  test('a fuel shortage skip is not added on top of military service', () => {
    const s = edit(mm(), (d) => {
      (d.players[0] as GameState['players'][number]).skipNextTurn = true;
    });
    expect(calledUp(s).players[0]?.skipNextTurn).toBe(false);
  });
});

describe('merit (spec 7.2)', () => {
  test('a pagoda offers a 200-lakh donation for one merit point, up to three', () => {
    const pagoda = spacesOf('temple')[0] as number;
    const s = rollTo(mm(), pagoda).state;
    expect(s.flow).toMatchObject({ phase: 'BuyDecision', pending: { kind: 'donation', space: pagoda } });
    expect(fail(s, { type: 'decline' }).code).toBe('wrongPhase');
    const given = run(s, { type: 'donate', give: true });
    expect(cashOf(given.state, 0)).toBe(cashOf(s, 0) - 200);
    expect(given.state.players[0]?.merit).toBe(1);
    expect(act(s, { type: 'donate', give: false }).players[0]?.merit).toBe(0);
    // With three merit points (or less than 200 lakh) nothing is offered.
    const full = edit(mm(), (d) => {
      (d.players[0] as GameState['players'][number]).merit = 3;
    });
    expect(rollTo(full, pagoda).state.flow.pending).toBeNull();
  });

  test('a merit point skips a rent owed to a player, never a tax', () => {
    const mandalay = (mm(), spaceOf('Mandalay'));
    const s = rollTo(
      edit(own(mm(), mandalay, 1), (d) => {
        (d.players[0] as GameState['players'][number]).merit = 2;
      }),
      mandalay,
    ).state;
    const { state, events } = run(s, { type: 'useMerit' });
    expect(cashOf(state, 0)).toBe(cashOf(s, 0));
    expect(state.players[0]?.merit).toBe(1);
    expect(eventsOf(events, 'rentWaived')[0]).toMatchObject({ why: 'merit', amount: 74 });
    const tax = spacesOf('tax')[0] as number;
    const taxed = rollTo(edit(mm(), (d) => void ((d.players[0] as GameState['players'][number]).merit = 1)), tax).state;
    expect(fail(taxed, { type: 'useMerit' }).code).toBe('wrongPhase');
  });

  test('a merit point cancels a bad Chance card, and only a bad one', () => {
    const chance = spacesOf('chance')[0] as number;
    const withMerit = edit(mm(), (d) => void ((d.players[0] as GameState['players'][number]).merit = 1));
    const s = rollTo(forceCard(withMerit, 'mm-chance-call-up'), chance).state;
    const { state, events } = run(s, { type: 'useMerit' });
    expect(state.players[0]).toMatchObject({ merit: 0, draft: null, position: chance });
    expect(eventsOf(events, 'cardCancelled')).toHaveLength(1);
    const good = rollTo(forceCard(withMerit, 'mm-chance-start'), chance).state;
    expect(fail(good, { type: 'useMerit' }).code).toBe('wrongPhase');
  });

  test('cards: the broker is paid or sends the player to the camp; the pagoda festival costs 100 for a point', () => {
    const chance = spacesOf('chance')[0] as number;
    const broker = rollTo(forceCard(mm(), 'mm-chance-broker'), chance).state;
    const paid = act(broker, { type: 'brokerPay' });
    expect(cashOf(paid, 0)).toBe(cashOf(broker, 0) - 500);
    expect(paid.players[0]?.position).toBe(chance);
    expect(act(broker, { type: 'confirmCard' }).flow.pending).toEqual({ kind: 'draftChoice' });

    const drawn = rollTo(forceCard(mm(), 'mm-chance-festival'), chance).state;
    const festival = act(drawn, { type: 'confirmCard' });
    expect(festival.players[0]?.merit).toBe(1);
    expect(cashOf(festival, 0)).toBe(cashOf(drawn, 0) - 100);
  });
});

describe('company events and inflation (spec 7.3, 7.4)', () => {
  const news = () => spacesOf('event')[0] as number;

  test('blackout: city rents halved and YESC earns double until the drawer’s next turn', () => {
    const [mandalay, yesc] = (mm(), [spaceOf('Mandalay'), spaceOf('YESC (Yangon Electricity)')]);
    const owned = own(mm(), [mandalay, yesc], 1);
    const s = act(rollTo(forceCard(owned, 'mm-event-blackout'), news()).state, { type: 'confirmCard' });
    expect(cityRent(s, mandalay).amount).toBe(37);
    expect(companyRent(s, yesc, [3, 4]).amount).toBe(7 * 25 * 2);
    expect(companyRent(owned, yesc, [3, 4]).amount).toBe(7 * 25);
  });

  test('internet cut: only the owner of MPT may offer trades', () => {
    const mpt = (mm(), spaceOf('MPT (mobile network)'));
    const falam = spaceOf('Falam');
    const owned = own(own(mm(), mpt, 2), falam, 1);
    const s = endTurn(act(rollTo(forceCard(owned, 'mm-event-internet'), news()).state, { type: 'confirmCard' }));
    const offer = (from: number, to: number) => ({
      type: 'proposeTrade' as const,
      offer: { from, to, give: { properties: [], cash: 10, jailCards: 0 }, get: { properties: from === 2 ? [falam] : [], cash: 0, jailCards: 0 } },
    });
    expect(validateAction(s, offer(0, 1))?.code).toBe('tradeBlocked');
    expect(legalActionsFor(s, 0).some((a) => a.type === 'proposeTrade')).toBe(false);
    expect(validateAction(s, offer(2, 1))).toBeNull();
    const onTable = act(s, offer(2, 1));
    // The partner may answer, but not counter.
    expect(legalActionsFor(onTable, 1).map((a) => a.type)).toEqual(['respondTrade', 'respondTrade']);
    expect(act(onTable, { type: 'respondTrade', accept: true }).properties[falam]?.owner).toBe(2);
  });

  test('fuel shortage: everyone skips their next turn, except the Denko owner and players in service', () => {
    const denko = (mm({ playerCount: 4 }), spaceOf('Denko (fuel stations)'));
    const s = edit(own(mm({ playerCount: 4 }), denko, 2), (d) => {
      (d.players[3] as GameState['players'][number]).draft = { status: 'hiding', turns: 2 };
    });
    const drawn = run(rollTo(forceCard(s, 'mm-event-fuel'), news()).state, { type: 'confirmCard' });
    expect(eventsOf(drawn.events, 'fuelShortage')[0]?.players).toEqual([0, 1]);
    expect(drawn.state.players.map((p) => p.skipNextTurn)).toEqual([true, true, false, false]);
  });

  test('inflation: the card adds 10% now, every five rounds add 10%, the KBZ owner pays without it', () => {
    const [mandalay, kbz] = (mm(), [spaceOf('Mandalay'), spaceOf('KBZ Bank')]);
    const owned = own(own(mm(), mandalay, 1), kbz, 2);
    const s = act(rollTo(forceCard(owned, 'mm-event-inflation'), news()).state, { type: 'confirmCard' });
    expect(s.economy.inflation).toBe(10);
    expect(cityRent(s, mandalay, 0).amount).toBe(Math.round(74 * 1.1));
    expect(cityRent(s, mandalay, 2).amount).toBe(74);
    // Round 6 begins: another 10%.
    let r = edit(owned, (d) => {
      d.turn.roundNumber = 5;
      d.turn.currentPlayerIndex = 2;
    });
    r = endTurn(rollTo(r, SPACES.jail).state);
    expect(r.turn.roundNumber).toBe(6);
    expect(r.economy.inflation).toBe(10);
  });
});

describe('saves in the middle of a Myanmar decision', () => {
  test('every new decision survives a save and a load', () => {
    const chance = spacesOf('chance')[0] as number;
    const states: GameState[] = [
      calledUp(),
      backToPlayer0(act(calledUp(), { type: 'draftChoose', how: 'hide' })),
      rollTo(mm(), spacesOf('temple')[0] as number).state,
      rollTo(forceCard(mm(), 'mm-chance-broker'), chance).state,
    ];
    expect(states.map((s) => s.flow.pending?.kind)).toEqual(['draftChoice', 'draftSkip', 'donation', 'card']);
    for (const s of states) {
      const parsed = parseSave(serializeGame(s));
      expect(parsed.ok && parsed.state).toEqual(s);
    }
  });

  test('none of this reaches the World map', () => {
    const s = rollTo(game(), SPACES.goToJail).state;
    expect(s.flow.phase).toBe('AwaitEndTurn');
    expect(s.players[0]?.inJail).toBe(true);
    expect(legalActions(nextDice(s, 1, 2)).some((a) => a.type === 'draftChoose' || a.type === 'useMerit')).toBe(false);
  });
});
