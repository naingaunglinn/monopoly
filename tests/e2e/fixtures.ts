// Game states for screenshots and resume tests, built with the real engine (reducer + its debug
// actions) and loaded into the app as a save, then opened with Continue.
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  createGame,
  decisionMaker,
  legalActions,
  reduce,
  SAVE_KEY,
  serializeGame,
  type Action,
  type DebugOp,
  type GameState,
  type Settings,
} from '../../src/engine';
import { BotRandom, sensibleBot } from '../../src/sim/bots';

export function act(s: GameState, ...actions: Action[]): GameState {
  let state = s;
  for (const a of actions) {
    const r = reduce(state, a);
    if (r.error) throw new Error(`${a.type}: ${r.error.reason}`);
    state = r.state;
  }
  return state;
}

const dbg = (s: GameState, op: DebugOp) => act(s, { type: 'debug', ...op } as Action);

export function own(s: GameState, spaces: number[], owner: number): GameState {
  return spaces.reduce((st, space) => dbg(st, { op: 'setOwner', space, owner }), s);
}

export function level(s: GameState, entries: Array<[number, number]>): GameState {
  // Raise levels one step at a time so the even rule holds after every debug action.
  let st = s;
  const max = Math.max(...entries.map(([, l]) => l));
  for (let l = 1; l <= max; l++) {
    for (const [space, target] of entries) if (target >= l) st = dbg(st, { op: 'setLevel', space, level: l });
  }
  return st;
}

export function cash(s: GameState, player: number, amount: number): GameState {
  return dbg(s, { op: 'cash', player, delta: amount - (s.players[player]?.cash ?? 0) });
}

export function rollTo(s: GameState, target: number, dice: [number, number] = [3, 4]): GameState {
  const from = (target - dice[0] - dice[1] + 80) % 80;
  let st = dbg(s, { op: 'movePlayer', player: s.turn.currentPlayerIndex, space: from });
  st = dbg(st, { op: 'setNextDice', dice });
  return act(st, { type: 'roll' });
}

/** Screenshots use animation Off so no capture lands mid-transition. */
export function base(settings: Partial<Settings> = {}, seed = 7): GameState {
  return createGame(
    { playerCount: 4, passDevice: false, animationSpeed: 'off', playerNames: ['Mia', 'Leo', 'Aung', 'Sofia'], ...settings },
    seed,
  );
}

/** A believable mid-game: sensible bots play a while, then it is someone's turn to roll. */
export function midGame(seed = 11, steps = 900): GameState {
  let s = base({}, seed);
  const rnd = new BotRandom(seed);
  for (let i = 0; i < steps; i++) {
    const legal = legalActions(s);
    const actor = decisionMaker(s);
    if (actor === null || legal.length === 0) break;
    s = act(s, sensibleBot({ state: s, legal, actor, rnd, freeActionsTaken: 0 }));
    if (s.flow.phase === 'GameOver') throw new Error('mid-game ended');
  }
  // Stop at the start of a turn.
  for (let i = 0; i < 200 && !(s.flow.phase === 'AwaitRoll' && s.turn.dice === null && s.flow.notices.length === 0); i++) {
    const legal = legalActions(s);
    const actor = decisionMaker(s) as number;
    s = act(s, sensibleBot({ state: s, legal, actor, rnd, freeActionsTaken: 0 }));
  }
  return s;
}

/** Worst case for tile text: everything owned, full sets with 4 houses or hotels, mortgages. */
export function crowdedBoard(): GameState {
  let s = base();
  const countries: number[][] = [
    [1, 3], [6, 8, 10], [12, 14], [18, 20, 21], [22, 24], [26, 28, 30], [32, 33, 36], [38, 41],
    [43, 44], [46, 49, 50], [52, 54, 56], [58, 60, 61], [63, 64], [66, 68, 69], [71, 72], [74, 76, 78, 79],
  ];
  countries.forEach((cities, i) => {
    s = own(s, cities, i % 4);
    if (i % 3 === 0) s = level(s, cities.map((sp): [number, number] => [sp, 5]));
    else if (i % 3 === 1) s = level(s, cities.map((sp): [number, number] => [sp, 4]));
    else s = act(s, ...cities.map((space) => ({ type: 'debug', op: 'setMortgaged', space, mortgaged: true }) as Action));
  });
  s = own(s, [4, 9, 15, 27, 35, 39, 48, 55, 67, 77], 1);
  s = own(s, [11, 16, 25, 31, 37, 45, 51, 73], 2);
  return s;
}

/** Six tokens sharing one side-column tile and six sharing a top-row tile. */
export function sixTokens(): GameState {
  let s = createGame(
    { playerCount: 6, passDevice: false, animationSpeed: 'off', playerNames: ['Mia', 'Leo', 'Aung', 'Sofia', 'Kenji', 'Nadia'] },
    3,
  );
  for (let p = 0; p < 6; p++) s = dbg(s, { op: 'movePlayer', player: p, space: p < 3 ? 21 : 21 });
  return s;
}

export function sixTokensTop(): GameState {
  let s = sixTokens();
  for (let p = 0; p < 6; p++) s = dbg(s, { op: 'movePlayer', player: p, space: 8 });
  return s;
}

/** Every panel and screen the review needs, keyed by name. */
export function panelStates(): Record<string, GameState> {
  const mid = midGame();
  const egypt = own(base(), [12, 14], 0);
  const bankrupt = act(rollTo(cash(own(base({ mode: 'quick' }), [12], 1), 0, 10), 12), { type: 'payRent' });
  const jail = (() => {
    let s = rollTo(base({ playerCount: 2, auction: false }), 57);
    s = act(s, { type: 'endTurn' });
    s = act(rollTo(s, 34), { type: 'endTurn' });
    return s;
  })();
  const vacation = rollTo(base(), 40);
  const vacationSkip = (() => {
    let s = act(rollTo(base({ playerCount: 2 }), 40), { type: 'acknowledge' }, { type: 'endTurn' });
    s = act(rollTo(s, 34), { type: 'endTurn' });
    return s;
  })();
  const auction = act(rollTo(base(), 9), { type: 'decline' }, { type: 'bid', amount: 60 });
  const debt = act(rollTo(cash(level(own(own(base(), [9, 4], 0), [12, 14], 1), [[12, 2], [14, 2]]), 0, 40), 12), {
    type: 'payRent',
  });
  const trade = act(own(own(base(), [12, 6], 0), [14, 8], 1), {
    type: 'proposeTrade',
    offer: {
      from: 0,
      to: 1,
      give: { properties: [6], cash: 150, jailCards: 0 },
      get: { properties: [14], cash: 0, jailCards: 0 },
    },
  });
  const over = act(bankrupt, { type: 'acknowledge' });
  return {
    'mid-game': mid,
    'crowded-board': crowdedBoard(),
    'six-tokens': sixTokens(),
    'six-tokens-top': sixTokensTop(),
    'pass-device': createGame({ playerCount: 4, animationSpeed: 'off', playerNames: ['Mia', 'Leo', 'Aung', 'Sofia'] }, 7),
    buy: rollTo(base(), 9),
    auction,
    rent: rollTo(level(own(base(), [38, 41], 1), [[38, 2], [41, 2]]), 38),
    'rent-airport': rollTo(own(base(), [15, 4, 9], 1), 15),
    tax: rollTo(base(), 65),
    company: rollTo(own(base(), [11], 1), 11),
    'company-rent': act(dbg(rollTo(own(base(), [11], 1), 11), { op: 'setNextDice', dice: [4, 3] }), {
      type: 'rollCompanyDice',
    }),
    build: rollTo(level(egypt, [[14, 1]]), 12),
    chance: rollTo(dbg(base(), { op: 'forceCard', deck: 'chance', cardId: 'chance-lost-luggage' }), 13),
    event: rollTo(dbg(base(), { op: 'forceCard', deck: 'event', cardId: 'event-tourism-boom' }), 19),
    jail,
    vacation,
    'vacation-skip': vacationSkip,
    debt,
    bankruptcy: bankrupt,
    trade,
    winner: over,
  };
}

/** Puts a state into the save slot and opens it with Continue from the start screen. */
export async function loadState(page: Page, state: GameState, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.evaluate(
    ([key, text]) => {
      window.localStorage.clear();
      window.localStorage.setItem(key as string, text as string);
    },
    [SAVE_KEY, serializeGame(state)],
  );
  await page.reload();
  await page.locator('#start-continue').click();
  await expect(page.locator('.game-screen')).toBeVisible();
}
