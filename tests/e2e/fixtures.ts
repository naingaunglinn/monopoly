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
import {
  AIRPORT_SPACES,
  BOARD,
  COMPANY_SPACES,
  COUNTRIES,
  COUNTRY_CITIES,
  LAYOUT,
  PROPERTY_SPACES,
  propertyName,
  setActiveMap,
  SPACES,
  type MapId,
} from '../../src/data/board';

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
  const from = (target - dice[0] - dice[1] + LAYOUT.size) % LAYOUT.size;
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
export function midGame(seed = 11, steps = 500, map: MapId = 'world'): GameState {
  let s = base({ map }, seed);
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
export function crowdedBoard(map: MapId = 'world'): GameState {
  let s = base({ map });
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
  // Leo answers with a counter-offer: Mexico City and $250 for Alexandria (D99).
  const tradeCounter = act(trade, {
    type: 'counterTrade',
    offer: {
      from: 1,
      to: 0,
      give: { properties: [alexandria], cash: 0, jailCards: 0 },
      get: { properties: [mexicoCity], cash: 250, jailCards: 0 },
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
    'trade-counter': tradeCounter,
    winner: over,
  };
}

/**
 * The Myanmar map (D101): its board, panels and cards. Space names are the English ones. The map in
 * play is put back to World afterwards, so World fixtures built later in this process are unchanged.
 */
export function myanmarStates(): Record<string, GameState> {
  const mm = (settings: Partial<Settings> = {}, seed = 7) => base({ map: 'myanmar', ...settings }, seed);
  try {
    mm();
    const [mandalay, meiktila, pyinOoLwin] = [sp('Mandalay'), sp('Meiktila'), sp('Pyin Oo Lwin')];
    const [yangonAirport, expressway, yesc] = [sp('Yangon International Airport'), sp('Yangon–Mandalay Expressway'), sp('YESC (Yangon Electricity)')];
    const chance = BOARD.find((x) => x.type === 'chance' && x.index >= 7)?.index as number;
    const news = BOARD.find((x) => x.type === 'event' && x.index >= 7)?.index as number;
    const special = BOARD.find((x) => x.type === 'tax' && x.tax === 'luxury')?.index as number;
    const pagoda = BOARD.find((x) => x.type === 'temple' && x.index >= 7)?.index as number;
    const region = own(mm(), [mandalay, meiktila, pyinOoLwin], 0);
    const camp = (() => {
      // Called up, player 0 serves; at their next turn the skipped-turn panel shows (D102).
      let s = rollTo(mm({ playerCount: 2, auction: false }), SPACES.goToJail);
      s = act(s, { type: 'draftChoose', how: 'serve' }, { type: 'endTurn' });
      s = act(rollTo(s, SPACES.jail), { type: 'endTurn' });
      return s;
    })();
    return {
      'mm-mid-game': midGame(11, 500, 'myanmar'),
      'mm-crowded-board': crowdedBoard('myanmar'),
      'mm-buy': rollTo(mm(), yangonAirport),
      'mm-rent': rollTo(level(own(mm(), [mandalay, meiktila, pyinOoLwin], 1), [[mandalay, 2], [meiktila, 2], [pyinOoLwin, 2]]), mandalay),
      'mm-rent-transport': rollTo(own(mm(), [yangonAirport, expressway], 1), yangonAirport),
      'mm-company': rollTo(own(mm(), [yesc], 1), yesc),
      'mm-tax': rollTo(mm(), special),
      'mm-pagoda': rollTo(mm(), pagoda),
      'mm-build': rollTo(level(region, [[meiktila, 1]]), mandalay),
      'mm-chance': rollTo(dbg(mm(), { op: 'forceCard', deck: 'chance', cardId: 'mm-chance-call-up' }), chance),
      'mm-news': rollTo(dbg(mm(), { op: 'forceCard', deck: 'event', cardId: 'mm-event-tourism' }), news),
      'mm-camp': camp,
      ...myanmarStage2(mm, { chance, news, pagoda, mandalay, meiktila, pyinOoLwin }),
    };
  } finally {
    setActiveMap('world');
  }
}

/** A copy of a state changed by `fn` (for set-ups the debug actions cannot make). */
function tweak(s: GameState, fn: (d: GameState) => void): GameState {
  const d = JSON.parse(JSON.stringify(s)) as GameState;
  fn(d);
  return d;
}

/** Stage 2 of the Myanmar map (D102): military service, merit, company news and inflation. */
function myanmarStage2(
  mm: (settings?: Partial<Settings>, seed?: number) => GameState,
  at: { chance: number; news: number; pagoda: number; mandalay: number; meiktila: number; pyinOoLwin: number },
): Record<string, GameState> {
  const merit = (s: GameState, n: number) => tweak(s, (d) => void ((d.players[0] as GameState['players'][number]).merit = n));
  const called = rollTo(merit(cash(mm(), 0, 8000), 1), SPACES.goToJail);
  const serving = tweak(mm(), (d) => {
    const p = d.players[0] as GameState['players'][number];
    p.draft = { status: 'serving', turns: 1 };
    p.merit = 1;
    d.flow.phase = 'TurnStart';
    d.flow.pending = { kind: 'draftSkip' };
  });
  const fuel = tweak(mm(), (d) => {
    (d.players[0] as GameState['players'][number]).skipNextTurn = true;
    d.flow.phase = 'TurnStart';
    d.flow.pending = { kind: 'vacationSkip' };
  });
  const rent = rollTo(merit(level(own(mm(), [at.mandalay, at.meiktila, at.pyinOoLwin], 1), [[at.mandalay, 1], [at.meiktila, 1], [at.pyinOoLwin, 1]]), 2), at.mandalay);
  const news = act(rollTo(dbg(mm(), { op: 'forceCard', deck: 'event', cardId: 'mm-event-blackout' }), at.news), { type: 'confirmCard' });
  const inflated = tweak(news, (d) => {
    d.economy.inflation = 20;
    (d.players[1] as GameState['players'][number]).merit = 3;
    (d.players[2] as GameState['players'][number]).draft = { status: 'hiding', turns: 2 };
  });
  return {
    'mm-draft-choice': called,
    'mm-draft-skip': serving,
    'mm-fuel-skip': fuel,
    'mm-rent-merit': rent,
    'mm-chance-cancel': rollTo(merit(dbg(mm(), { op: 'forceCard', deck: 'chance', cardId: 'mm-chance-call-up' }), 1), at.chance),
    'mm-broker': rollTo(dbg(mm(), { op: 'forceCard', deck: 'chance', cardId: 'mm-chance-broker' }), at.chance),
    'mm-inflation': tweak(inflated, (d) => void (d.economy.pot = 1250)),
    ...myanmarStage3(mm, at),
  };
}

/** Stage 3 of the Myanmar map (D103): the lottery, the community pot and tolls. */
function myanmarStage3(
  mm: (settings?: Partial<Settings>, seed?: number) => GameState,
  at: { chance: number; news: number },
): Record<string, GameState> {
  const expressway = sp('Yangon–Mandalay Expressway');
  const falam = sp('Falam');
  const toll = (() => {
    let s = own(own(cash(mm(), 0, 5), [expressway], 1), [falam], 0);
    s = dbg(s, { op: 'movePlayer', player: 0, space: expressway - 2 });
    s = dbg(s, { op: 'setNextDice', dice: [1, 3] });
    return act(s, { type: 'roll' });
  })();
  return {
    'mm-lottery': rollTo(dbg(mm(), { op: 'forceCard', deck: 'chance', cardId: 'mm-chance-lottery' }), at.chance),
    'mm-earthquake': rollTo(dbg(mm(), { op: 'forceCard', deck: 'event', cardId: 'mm-event-earthquake' }), at.news),
    'mm-toll-debt': toll,
    'mm-pot-phone': tweak(mm(), (d) => void (d.economy.pot = 2400)),
  };
}

/**
 * Puts a state into the save slot and opens it with Continue from the start screen. `prefs` are
 * this device's preferences (the Myanmar map's names in Burmese: `{ language: 'my' }`).
 */
export async function loadState(page: Page, state: GameState, query = '', prefs: Record<string, unknown> | null = null): Promise<void> {
  await page.goto(`/${query}`);
  await page.evaluate(
    ([key, text, prefsText]) => {
      window.localStorage.clear();
      window.localStorage.setItem(key as string, text as string);
      if (prefsText) window.localStorage.setItem('global-monopoly/prefs/v1', prefsText as string);
    },
    [SAVE_KEY, serializeGame(state), prefs ? JSON.stringify(prefs) : ''],
  );
  await page.reload();
  await page.locator('#start-continue').click();
  await expect(page.locator('.game-screen')).toBeVisible();
}
