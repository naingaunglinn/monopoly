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
import { BOARD_SIZE } from '../../src/data/balance';
import { AIRPORT_SPACES, BOARD, COMPANY_SPACES, COUNTRIES, COUNTRY_CITIES, PROPERTY_SPACES, propertyName, SPACES } from '../../src/data/board';

/** The index of the city, airport or company with this name on the board in play. */
export function sp(name: string): number {
  const space = PROPERTY_SPACES.find((i) => propertyName(i) === name);
  if (space === undefined) throw new Error(`No space named ${name} on this board`);
  return space;
}

/** A Chance space reached by a 3 and a 4 without passing World Start. */
export const CHANCE = BOARD.find((s) => s.type === 'chance' && s.index >= 7)?.index as number;
export const EVENT = BOARD.find((s) => s.type === 'event' && s.index >= 7)?.index as number;
export const LUXURY_TAX = BOARD.find((s) => s.type === 'tax' && s.tax === 'luxury')?.index as number;

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
  const from = (target - dice[0] - dice[1] + BOARD_SIZE) % BOARD_SIZE;
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

/**
 * A believable mid-game: sensible bots play a while, then it is someone's turn to roll. If the game
 * ends first (more likely on a small board), it is the last turn start before the end.
 */
export function midGame(seed = 11, steps = 500): GameState {
  let s = base({}, seed);
  const rnd = new BotRandom(seed);
  const atTurnStart = (st: GameState) => st.flow.phase === 'AwaitRoll' && st.turn.dice === null && st.flow.notices.length === 0;
  let lastStart: GameState | null = null;
  for (let i = 0; i < steps; i++) {
    const legal = legalActions(s);
    const actor = decisionMaker(s);
    if (actor === null || legal.length === 0) break;
    s = act(s, sensibleBot({ state: s, legal, actor, rnd, freeActionsTaken: 0 }));
    if (s.flow.phase === 'GameOver') {
      if (!lastStart) throw new Error('mid-game ended');
      return lastStart;
    }
    if (atTurnStart(s)) lastStart = s;
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
  const countries: number[][] = COUNTRIES.map((c) => [...COUNTRY_CITIES[c.id]]);
  countries.forEach((cities, i) => {
    s = own(s, cities, i % 4);
    if (i % 3 === 0) s = level(s, cities.map((sp): [number, number] => [sp, 5]));
    else if (i % 3 === 1) s = level(s, cities.map((sp): [number, number] => [sp, 4]));
    else s = act(s, ...cities.map((space) => ({ type: 'debug', op: 'setMortgaged', space, mortgaged: true }) as Action));
  });
  s = own(s, [...AIRPORT_SPACES], 1);
  s = own(s, [...COMPANY_SPACES], 2);
  return s;
}

/** Six tokens sharing one side-column tile and six sharing a top-row tile. */
export function sixTokens(): GameState {
  let s = createGame(
    { playerCount: 6, passDevice: false, animationSpeed: 'off', playerNames: ['Mia', 'Leo', 'Aung', 'Sofia', 'Kenji', 'Nadia'] },
    3,
  );
  for (let p = 0; p < 6; p++) s = dbg(s, { op: 'movePlayer', player: p, space: sp('Haifa') });
  return s;
}

export function sixTokensTop(): GameState {
  let s = sixTokens();
  for (let p = 0; p < 6; p++) s = dbg(s, { op: 'movePlayer', player: p, space: sp('Guadalajara') });
  return s;
}

/** Every panel and screen the review needs, keyed by name. */
export function panelStates(): Record<string, GameState> {
  const mid = midGame();
  const [cairo, alexandria, mexicoCity, guadalajara] = [sp('Cairo'), sp('Alexandria'), sp('Mexico City'), sp('Guadalajara')];
  const [egyptAirport, brazilAirport, tokyo, osaka, transport] = [sp('Egypt Airport'), sp('Brazil Airport'), sp('Tokyo'), sp('Osaka'), sp('Transportation Company')];
  const egypt = own(base(), [cairo, alexandria], 0);
  const bankrupt = act(rollTo(cash(own(base({ mode: 'quick' }), [cairo], 1), 0, 10), cairo), { type: 'payRent' });
  // Visiting the Jail: a landing where nothing happens.
  const rest = SPACES.jail;
  const jail = (() => {
    let s = rollTo(base({ playerCount: 2, auction: false }), SPACES.goToJail);
    s = act(s, { type: 'endTurn' });
    s = act(rollTo(s, rest), { type: 'endTurn' });
    return s;
  })();
  const vacation = rollTo(base(), SPACES.vacation);
  const vacationSkip = (() => {
    let s = act(rollTo(base({ playerCount: 2 }), SPACES.vacation), { type: 'acknowledge' }, { type: 'endTurn' });
    s = act(rollTo(s, rest), { type: 'endTurn' });
    return s;
  })();
  const auction = act(rollTo(base(), egyptAirport), { type: 'decline' }, { type: 'bid', amount: 60 });
  const debt = act(
    rollTo(cash(level(own(own(base(), [egyptAirport, brazilAirport], 0), [cairo, alexandria], 1), [[cairo, 2], [alexandria, 2]]), 0, 40), cairo),
    { type: 'payRent' },
  );
  const trade = act(own(own(base(), [cairo, mexicoCity], 0), [alexandria, guadalajara], 1), {
    type: 'proposeTrade',
    offer: {
      from: 0,
      to: 1,
      give: { properties: [mexicoCity], cash: 150, jailCards: 0 },
      get: { properties: [alexandria], cash: 0, jailCards: 0 },
    },
  });
  const over = act(bankrupt, { type: 'acknowledge' });
  return {
    'mid-game': mid,
    'crowded-board': crowdedBoard(),
    'six-tokens': sixTokens(),
    'six-tokens-top': sixTokensTop(),
    'pass-device': createGame({ playerCount: 4, animationSpeed: 'off', playerNames: ['Mia', 'Leo', 'Aung', 'Sofia'] }, 7),
    buy: rollTo(base(), egyptAirport),
    auction,
    rent: rollTo(level(own(base(), [tokyo, osaka], 1), [[tokyo, 2], [osaka, 2]]), tokyo),
    'rent-airport': rollTo(own(base(), [egyptAirport, ...AIRPORT_SPACES.filter((a) => a !== egyptAirport).slice(0, 2)], 1), egyptAirport),
    tax: rollTo(base(), LUXURY_TAX),
    company: rollTo(own(base(), [transport], 1), transport),
    'company-rent': act(dbg(rollTo(own(base(), [transport], 1), transport), { op: 'setNextDice', dice: [4, 3] }), {
      type: 'rollCompanyDice',
    }),
    build: rollTo(level(egypt, [[alexandria, 1]]), cairo),
    chance: rollTo(dbg(base(), { op: 'forceCard', deck: 'chance', cardId: 'chance-lost-luggage' }), CHANCE),
    event: rollTo(dbg(base(), { op: 'forceCard', deck: 'event', cardId: 'event-tourism-boom' }), EVENT),
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
