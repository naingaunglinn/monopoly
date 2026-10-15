// The Myanmar map's spec v2, stage 3 (D107): rank from serving, the general, the general's power,
// the unrest window and bribes. Spaces are found by name; corners come from SPACES.
import { describe, expect, test } from 'vitest';
import { MYANMAR } from '../../src/data/balance';
import { SPACES } from '../../src/data/board';
import {
  checkInvariants,
  legalActions,
  legalActionsFor,
  parseSave,
  reduce,
  serializeGame,
  validateAction,
  type Action,
  type GameState,
} from '../../src/engine';
import { act, cashOf, edit, endTurn, eventsOf, fail, game, nextDice, own, rollTo, run, spaceOf } from './helpers';

const mm = (settings: Parameters<typeof game>[0] = {}, seed = 7) => game({ map: 'myanmar', playerCount: 4, ...settings }, seed);
type P = GameState['players'][number];

/** Player 0 is the general (rank 4) and it is their turn, power ready. */
function withGeneral(s: GameState = mm(), rank = 4): GameState {
  return edit(s, (d) => {
    const p = d.players[0] as P;
    p.rank = rank;
    p.rankAt = 1;
    d.economy.rankSeq = 1;
    d.economy.general = 0;
  });
}

/** The general uses the power with these dice and picks this target (and property). */
function powerOn(s: GameState, dice: [number, number], target: number, space: number | null = null): GameState {
  const rolled = run(nextDice(s, dice[0], dice[1]), { type: 'usePower' }).state;
  return act(rolled, { type: 'powerTarget', player: target, space });
}

/** Everyone in the window answers: `uses` show a cup, the rest hold. */
function answerAll(s: GameState, uses: number[] = [], blocker: number | null = null): GameState {
  let state = s;
  for (let guard = 0; guard < 10 && state.flow.pending?.kind === 'unrest'; guard++) {
    const who = state.flow.pending.waiting[0] as number;
    state = act(state, { type: 'unrestAnswer', player: who, use: uses.includes(who), block: who === blocker });
  }
  return state;
}

describe('rank from serving', () => {
  test('the end of service rolls a die: even +2, odd +1; salary rank × 200 on top of the 300', () => {
    const serving = edit(mm(), (d) => {
      const p = d.players[0] as P;
      p.draft = { status: 'serving', turns: 1 };
      p.position = SPACES.jail;
      d.flow.phase = 'TurnStart';
      d.flow.pending = { kind: 'draftSkip' };
    });
    const even = run(nextDice(serving, 4, 1), { type: 'acknowledge' });
    expect(even.state.players[0]?.rank).toBe(2);
    expect(cashOf(even.state, 0)).toBe(cashOf(serving, 0) + MYANMAR.draftServeBonus + 2 * 200);
    expect(eventsOf(even.events, 'promoted')[0]).toMatchObject({ die: 4, rank: 2, salary: 400 });
    const odd = run(nextDice(serving, 3, 1), { type: 'acknowledge' });
    expect(odd.state.players[0]?.rank).toBe(1);
    // At most 6.
    const top = run(
      nextDice(
        edit(serving, (d) => {
          (d.players[0] as P).rank = 5;
          d.economy.general = 0;
        }),
        2,
        1,
      ),
      { type: 'acknowledge' },
    );
    expect(top.state.players[0]?.rank).toBe(6);
  });

  test('reaching rank 4 makes the general; equal ranks keep the first; climbing higher takes over', () => {
    const at = (rank: number, player: number, d: GameState) => {
      const p = d.players[player] as P;
      p.draft = { status: 'serving', turns: 1 };
      p.rank = rank;
    };
    let s = edit(mm(), (d) => {
      at(2, 0, d);
      d.flow.phase = 'TurnStart';
      d.flow.pending = { kind: 'draftSkip' };
    });
    const made = run(nextDice(s, 2, 1), { type: 'acknowledge' });
    expect(made.state.economy.general).toBe(0);
    expect(eventsOf(made.events, 'generalChanged')[0]).toEqual({ type: 'generalChanged', player: 0, previous: null });
    // Player 1 reaches 4 too: player 0 stays general; then 6 takes over.
    s = edit(made.state, (d) => {
      at(2, 1, d);
      d.turn.currentPlayerIndex = 1;
      d.flow.phase = 'TurnStart';
      d.flow.pending = { kind: 'draftSkip' };
    });
    const tie = act(nextDice(s, 2, 1), { type: 'acknowledge' });
    expect(tie.economy.general).toBe(0);
    const higher = act(
      nextDice(
        edit(s, (d) => void ((d.players[1] as P).rank = 4)),
        2,
        1,
      ),
      { type: 'acknowledge' },
    );
    expect(higher.economy.general).toBe(1);
    expect(higher.players[0]?.rank).toBe(4);
  });
});

describe('the general’s power', () => {
  test('ready on the general’s own turn, once in two rounds', () => {
    const s = withGeneral();
    expect(legalActions(s)).toContainEqual({ type: 'usePower' });
    const used = act(powerOn(s, [2, 3], 1), { type: 'unrestAnswer', player: 1, use: false, block: false });
    const done = answerAll(used);
    expect(validateAction(done, { type: 'usePower' })?.code).toBe('powerNotReady');
    // Not on someone else's turn.
    expect(validateAction(endTurn(rollTo(withGeneral(), SPACES.jail).state), { type: 'usePower' })?.code).toBe('powerNotReady');
  });

  test('up to 8: 1,000 lakh from the target; above 8: one of their properties', () => {
    const s = withGeneral();
    const money = answerAll(powerOn(s, [4, 4], 2));
    expect(cashOf(money, 2)).toBe(cashOf(s, 2) - 1000);
    expect(cashOf(money, 0)).toBe(cashOf(s, 0) + 1000);
    const falam = spaceOf('Falam');
    const owned = own(s, falam, 3);
    const land = answerAll(powerOn(owned, [5, 4], 3, falam));
    expect(land.properties[falam]?.owner).toBe(0);
  });

  test('no built land, no pledged land, nothing in a region with buildings', () => {
    const [falam, hakha] = (mm(), [spaceOf('Falam'), spaceOf('Hakha')]);
    const s = act(withGeneral(own(mm(), [falam, hakha], 3)), { type: 'debug', op: 'setLevel', space: falam, level: 1 } as never);
    const rolled = run(nextDice(s, 6, 5), { type: 'usePower' });
    // Both Chin cities are off limits (one built, the other in the same region): nothing to take.
    expect(eventsOf(rolled.events, 'powerFizzled')).toHaveLength(1);
    expect(rolled.state.flow.pending).toBeNull();
  });

  test('the target can block it once with 2 merit points', () => {
    const s = edit(withGeneral(), (d) => void ((d.players[2] as P).merit = 2));
    const blocked = answerAll(powerOn(s, [2, 2], 2), [], 2);
    expect(cashOf(blocked, 2)).toBe(cashOf(s, 2));
    expect(blocked.players[2]?.merit).toBe(0);
  });
});

describe('unrest', () => {
  test('every other player answers, in any order; who showed a cup is open to all', () => {
    const s = powerOn(withGeneral(), [2, 2], 1);
    if (s.flow.pending?.kind !== 'unrest') throw new Error('no window');
    expect(s.flow.pending.waiting).toEqual([1, 2, 3]);
    // Player 3 answers first (any order), through legalActionsFor.
    expect(legalActionsFor(s, 3)).toContainEqual({ type: 'unrestAnswer', player: 3, use: true, block: false });
    const t = act(s, { type: 'unrestAnswer', player: 3, use: true, block: false });
    expect(t.players[3]?.unrest).toBe(1);
    expect(t.economy.unrestUsed).toBe(1);
    expect(fail(t, { type: 'unrestAnswer', player: 3, use: false, block: false }).code).toBe('wrongPhase');
  });

  test('the third cup brings the general down: the use is cancelled, rank lost, cups back', () => {
    let s = withGeneral();
    s = answerAll(powerOn(s, [2, 2], 1), [1]);
    expect(s.economy.unrestUsed).toBe(1);
    s = edit(s, (d) => void (d.economy.powerRound = null));
    s = answerAll(powerOn(s, [2, 2], 2), [2]);
    s = edit(s, (d) => void (d.economy.powerRound = null));
    const cash = cashOf(s, 3);
    const out = run(powerOn(s, [2, 2], 3), { type: 'unrestAnswer', player: 1, use: false, block: false });
    const final = answerAll(out.state, [3]);
    expect(final.economy.general).toBeNull();
    expect(final.players[0]?.rank).toBe(0);
    expect(cashOf(final, 3)).toBe(cash);
    expect(final.players.map((p) => p.unrest)).toEqual([2, 2, 2, 2]);
    expect(final.economy.unrestUsed).toBe(0);
    expect(checkInvariants(final)).toEqual([]);
  });

  test('with two players, two cups are enough', () => {
    let s = withGeneral(mm({ playerCount: 2 }));
    s = answerAll(powerOn(s, [2, 2], 1), [1]);
    s = edit(s, (d) => void (d.economy.powerRound = null));
    const down = answerAll(powerOn(s, [2, 2], 1), [1]);
    expect(down.economy.general).toBeNull();
  });
});

describe('bribes', () => {
  test('a bribed player cannot show unrest at the next use, then can again', () => {
    const s = withGeneral();
    const offered = act(s, { type: 'offerBribe', to: 1, amount: 300 });
    expect(offered.flow.pending).toEqual({ kind: 'bribe', to: 1, amount: 300 });
    expect(legalActions(offered).map((a) => a.type)).toEqual(['respondBribe', 'respondBribe']);
    const taken = act(offered, { type: 'respondBribe', accept: true });
    expect(cashOf(taken, 1)).toBe(cashOf(s, 1) + 300);
    expect(taken.economy.bribed).toEqual([1]);
    const window = powerOn(taken, [2, 2], 2);
    if (window.flow.pending?.kind !== 'unrest') throw new Error('no window');
    expect(window.flow.pending.waiting).toEqual([2, 3]);
    const after = answerAll(window);
    expect(after.economy.bribed).toEqual([]);
  });

  test('turned down: no money moves', () => {
    const s = withGeneral();
    const no = act(s, { type: 'offerBribe', to: 1, amount: 300 }, { type: 'respondBribe', accept: false });
    expect(cashOf(no, 1)).toBe(cashOf(s, 1));
    expect(no.economy.bribed).toEqual([]);
  });
});

describe('saves and the World map', () => {
  test('a window, a target choice and a bribe on the table survive a save and a load', () => {
    const s = withGeneral();
    const states = [
      run(nextDice(s, 2, 2), { type: 'usePower' }).state,
      powerOn(s, [2, 2], 1),
      act(s, { type: 'offerBribe', to: 1, amount: 300 }),
    ];
    expect(states.map((x) => x.flow.pending?.kind)).toEqual(['powerTarget', 'unrest', 'bribe']);
    for (const state of states) {
      const parsed = parseSave(serializeGame(state));
      expect(parsed.ok && parsed.state).toEqual(state);
    }
  });

  test('no rank or general on the World map', () => {
    const s = game();
    expect(legalActions(s).some((a) => a.type === 'usePower' || a.type === 'offerBribe')).toBe(false);
    const bad = edit(s, (d) => void ((d.players[0] as P).rank = 0));
    expect(reduce(bad, { type: 'usePower' } as Action).error?.code).toBe('powerNotReady');
  });
});

describe('army pay and half rent (owner, D109)', () => {
  test('a player with a rank collects half rent, on cities, transport and companies', () => {
    const [mandalay, airport, yesc] = (mm(), [spaceOf('Mandalay'), spaceOf('Yangon International Airport'), spaceOf('YESC (Yangon Electricity)')]);
    const plain = own(mm(), [mandalay, airport, yesc], 1);
    const ranked = edit(plain, (d) => void ((d.players[1] as P).rank = 2));
    const due = (s: GameState, space: number) => {
      const landed = rollTo(s, space).state;
      if (landed.flow.phase === 'CompanyRoll') return act(nextDice(landed, 3, 4), { type: 'rollCompanyDice' }).flow.pending;
      return landed.flow.pending;
    };
    const amount = (p: ReturnType<typeof due>) => (p?.kind === 'rent' ? p.rent.amount : NaN);
    expect(amount(due(ranked, mandalay))).toBe(37);
    expect(amount(due(plain, mandalay))).toBe(74);
    expect(amount(due(ranked, airport))).toBe(25);
    expect(amount(due(ranked, yesc))).toBe(Math.round((7 * 25) / 2));
  });

  test('a player with a rank draws rank × 200 each time they pass Start', () => {
    const ranked = edit(mm(), (d) => void ((d.players[0] as P).rank = 3));
    const passed = run(nextDice(edit(ranked, (d) => void ((d.players[0] as P).position = 45)), 3, 4), { type: 'roll' });
    expect(eventsOf(passed.events, 'salaryPaid')).toEqual([{ type: 'salaryPaid', player: 0, amount: 600 }]);
    expect(eventsOf(passed.events, 'passedStart')[0]?.amount).toBe(MYANMAR.startBonus);
    const plain = run(nextDice(edit(mm(), (d) => void ((d.players[0] as P).position = 45)), 3, 4), { type: 'roll' });
    expect(eventsOf(plain.events, 'salaryPaid')).toEqual([]);
  });

  test('none of this on the World map', () => {
    const passed = run(nextDice(edit(game(), (d) => void ((d.players[0] as P).position = 58)), 3, 4), { type: 'roll' });
    expect(eventsOf(passed.events, 'salaryPaid')).toEqual([]);
  });
});


describe('no land for a player with a rank (owner, D111)', () => {
  test('cannot buy, takes no part in the auction, cannot receive land in a trade', () => {
    const [falam, hakha] = (mm(), [spaceOf('Falam'), spaceOf('Hakha')]);
    const ranked = edit(mm(), (d) => {
      (d.players[0] as P).rank = 1;
      (d.players[2] as P).rank = 2;
    });
    const landed = rollTo(ranked, falam).state;
    expect(validateAction(landed, { type: 'buy' })?.code).toBe('rankNoBuy');
    const auction = act(landed, { type: 'decline' });
    expect(auction.flow.pending?.kind === 'auction' && auction.flow.pending.auction.order).toEqual([1, 3]);
    const owned = own(ranked, hakha, 1);
    const trade = { from: 1, to: 0, give: { properties: [hakha], cash: 0, jailCards: 0 }, get: { properties: [], cash: 50, jailCards: 0 } };
    expect(validateAction(owned, { type: 'proposeTrade', offer: trade })?.code).toBe('rankNoBuy');
    // Without a rank, buying is as before.
    expect(validateAction(rollTo(mm(), falam).state, { type: 'buy' })).toBeNull();
  });
});
