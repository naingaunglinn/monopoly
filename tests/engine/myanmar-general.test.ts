// The Myanmar map's spec v2, stage 3 (D107): rank from serving, the general, the general's power,
// the unrest window and bribes; the power hits the richest player and the general is a house rule
// (D115). Spaces are found by name; corners come from SPACES.
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

/** Makes player `p` the richest by far, so the power hits them (D115). */
function richest(s: GameState, p: number): GameState {
  return edit(s, (d) => void ((d.players[p] as P).cash = Math.max(...d.players.map((x) => x.cash)) + 5000));
}

/**
 * The general uses the power with these dice. Money goes straight to the window against the
 * richest player, who must be `target`; for land the general takes `space` from `target`.
 */
function powerOn(s: GameState, dice: [number, number], target: number, space: number | null = null): GameState {
  const rolled = run(nextDice(s, dice[0], dice[1]), { type: 'usePower' }).state;
  if (rolled.flow.pending?.kind === 'powerTarget') return act(rolled, { type: 'powerTarget', player: target, space });
  if (rolled.flow.pending?.kind !== 'unrest' || rolled.flow.pending.target !== target) throw new Error(`the power did not hit player ${target}`);
  return rolled;
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
    const s = richest(withGeneral(), 1);
    expect(legalActions(s)).toContainEqual({ type: 'usePower' });
    const used = act(powerOn(s, [2, 3], 1), { type: 'unrestAnswer', player: 1, use: false, block: false });
    const done = answerAll(used);
    expect(validateAction(done, { type: 'usePower' })?.code).toBe('powerNotReady');
    // Not on someone else's turn.
    expect(validateAction(endTurn(rollTo(withGeneral(), SPACES.jail).state), { type: 'usePower' })?.code).toBe('powerNotReady');
  });

  test('up to 8: 10% of the richest player’s cash, from 300 to 1,500 lakh (D115)', () => {
    const at = (cash: number) => {
      const s = edit(withGeneral(), (d) => {
        for (const p of d.players) p.cash = 1000;
        (d.players[2] as P).cash = cash;
      });
      const after = answerAll(powerOn(s, [4, 4], 2));
      expect(cashOf(after, 0) - cashOf(s, 0)).toBe(cashOf(s, 2) - cashOf(after, 2));
      return cashOf(s, 2) - cashOf(after, 2);
    };
    expect(at(9000)).toBe(900);
    expect(at(2000)).toBe(MYANMAR.powerMoneyMin);
    expect(at(40000)).toBe(MYANMAR.powerMoneyMax);
  });

  test('the general does not choose: the richest by net worth, then cash, then the earlier seat (D115)', () => {
    // Everyone equal: the lowest seat other than the general's.
    const s = withGeneral();
    const tie = run(nextDice(s, 2, 2), { type: 'usePower' }).state;
    expect(tie.flow.pending?.kind === 'unrest' && tie.flow.pending.target).toBe(1);
    // Land counts: player 3 owns a city and so is richer than the rest at equal cash.
    const owned = own(s, spaceOf('Falam'), 3);
    const byWorth = run(nextDice(owned, 2, 2), { type: 'usePower' }).state;
    expect(byWorth.flow.pending?.kind === 'unrest' && byWorth.flow.pending.target).toBe(3);
  });

  test('above 8: one property of the richest player who has one; the general picks which', () => {
    const [falam, hakha] = (mm(), [spaceOf('Falam'), spaceOf('Hakha')]);
    // Player 1 is richest but owns nothing: the land goes past them to player 3.
    const s = richest(own(withGeneral(), [falam, hakha], 3), 1);
    const rolled = run(nextDice(s, 5, 4), { type: 'usePower' }).state;
    expect(legalActions(rolled)).toEqual([
      { type: 'powerTarget', player: 3, space: falam },
      { type: 'powerTarget', player: 3, space: hakha },
    ]);
    expect(validateAction(rolled, { type: 'powerTarget', player: 1, space: null })?.code).toBe('powerTarget');
    expect(validateAction(rolled, { type: 'powerTarget', player: 2, space: null })?.code).toBe('powerTarget');
    const land = answerAll(act(rolled, { type: 'powerTarget', player: 3, space: hakha }));
    expect(land.properties[hakha]?.owner).toBe(0);
    expect(land.properties[falam]?.owner).toBe(3);
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
    const s = edit(richest(withGeneral(), 2), (d) => void ((d.players[2] as P).merit = 2));
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
    let s = richest(withGeneral(), 1);
    s = answerAll(powerOn(s, [2, 2], 1), [1]);
    expect(s.economy.unrestUsed).toBe(1);
    s = richest(edit(s, (d) => void (d.economy.powerRound = null)), 2);
    s = answerAll(powerOn(s, [2, 2], 2), [2]);
    s = richest(edit(s, (d) => void (d.economy.powerRound = null)), 3);
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
    const window = powerOn(richest(taken, 2), [2, 2], 2);
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
      run(nextDice(own(s, spaceOf('Falam'), 2), 6, 5), { type: 'usePower' }).state,
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

describe('rank 4 or more: no land (owner, D113)', () => {
  test('landing on land for sale goes on with no auction; no bidding in others’ auctions; rank 3 still buys', () => {
    const falam = (mm(), spaceOf('Falam'));
    const high = withGeneral();
    const moved = rollTo(high, falam);
    expect(eventsOf(moved.events, 'buyBarred')).toEqual([{ type: 'buyBarred', player: 0, space: falam, rank: 4 }]);
    expect(moved.state.flow.pending).toBeNull();
    expect(moved.state.properties[falam]?.owner).toBeNull();
    // Someone else's auction: the general does not bid.
    const other = endTurn(moved.state);
    const auction = act(rollTo(other, falam).state, { type: 'decline' });
    expect(auction.flow.pending?.kind === 'auction' && auction.flow.pending.auction.order.includes(0)).toBe(false);
    // Rank 3 buys as before.
    const three = edit(mm(), (d) => void ((d.players[0] as P).rank = 3));
    expect(validateAction(rollTo(three, falam).state, { type: 'buy' })).toBeNull();
  });
});

describe('the general as a house rule (D115)', () => {
  test('switched off: no general and no power; rank, salary, half rent and the rank 4 land rule stay', () => {
    const off = mm({ general: false });
    expect(off.meta.settings.general).toBe(false);
    const serving = edit(off, (d) => {
      const p = d.players[0] as P;
      p.rank = 3;
      p.draft = { status: 'serving', turns: 1 };
      p.position = SPACES.jail;
      d.flow.phase = 'TurnStart';
      d.flow.pending = { kind: 'draftSkip' };
    });
    const back = run(nextDice(serving, 4, 1), { type: 'acknowledge' });
    expect(back.state.players[0]?.rank).toBe(5);
    expect(back.state.economy.general).toBeNull();
    expect(eventsOf(back.events, 'generalChanged')).toEqual([]);
    expect(checkInvariants(back.state)).toEqual([]);
    expect(legalActions(back.state).some((a) => a.type === 'usePower' || a.type === 'offerBribe')).toBe(false);
    expect(reduce(back.state, { type: 'offerBribe', to: 1, amount: 300 }).error).not.toBeNull();
    // The rank 4 land rule and the salary at Start still apply.
    const falam = (mm(), spaceOf('Falam'));
    const ranked = edit(off, (d) => void ((d.players[0] as P).rank = 6));
    expect(eventsOf(rollTo(ranked, falam).events, 'buyBarred')).toHaveLength(1);
    const passed = run(nextDice(edit(ranked, (d) => void ((d.players[0] as P).position = 45)), 3, 4), { type: 'roll' });
    expect(eventsOf(passed.events, 'salaryPaid')).toEqual([{ type: 'salaryPaid', player: 0, amount: 1200 }]);
  });

  test('on by default, and kept through a save', () => {
    expect(mm().meta.settings.general).toBe(true);
    const off = mm({ general: false });
    const parsed = parseSave(serializeGame(off));
    expect(parsed.ok && parsed.state.meta.settings.general).toBe(false);
  });
});
