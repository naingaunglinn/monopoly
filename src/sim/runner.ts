// Headless simulation runner: seeded bot games with invariant checks after every action.
import { SIM } from '../data/balance';
import {
  checkInvariants,
  createGame,
  decisionMaker,
  legalActions,
  reduce,
  type Action,
  type GameMode,
  type GameState,
} from '../engine';
import { BotRandom, chooseAction, isFreeAction, type BotKind } from './bots';

export interface GameResult {
  seed: number;
  mode: GameMode;
  /** Rounds played (the round in progress when the game ended counts as played). */
  rounds: number;
  finished: boolean;
  hitCap: boolean;
  houses: number;
  hotels: number;
  bankruptcies: number;
  actions: number;
  winners: number[];
  bots: BotKind[];
  endReason: string;
  /** How often each action type was taken. */
  actionCounts: Record<string, number>;
  /** Phases the game passed through. */
  phases: string[];
}

export class SimulationFailure extends Error {
  constructor(
    message: string,
    readonly seed: number,
    readonly mode: GameMode,
    readonly lastActions: Action[],
  ) {
    super(message);
  }
}

export interface SimOptions {
  players?: number;
  roundCap?: number;
  /** Safety net against an engine loop (far above anything a real game needs). */
  maxActions?: number;
  checkInvariants?: boolean;
}

/** Seats alternate between the two bots; the pattern shifts with the seed to avoid seat bias. */
export function botsForSeed(seed: number, players: number): BotKind[] {
  return Array.from({ length: players }, (_, seat) => ((seat + seed) % 2 === 0 ? 'sensible' : 'random'));
}

export function simulateGame(seed: number, mode: GameMode, options: SimOptions = {}): GameResult {
  const players = options.players ?? SIM.playersPerGame;
  const roundCap = options.roundCap ?? SIM.normalRoundCap;
  const maxActions = options.maxActions ?? 2_000_000;
  const check = options.checkInvariants ?? true;
  const bots = botsForSeed(seed, players);
  const rnd = new BotRandom(seed * 7919 + 17);
  let s: GameState = createGame({ playerCount: players, mode }, seed);
  const recent: Action[] = [];
  let actions = 0;
  let hitCap = false;
  let freeActor = -1;
  let freeCount = 0;
  const actionCounts: Record<string, number> = {};
  const phases = new Set<string>([s.flow.phase]);

  const failure = (message: string) => new SimulationFailure(message, seed, mode, recent.slice(-25));

  while (s.flow.phase !== 'GameOver') {
    if (mode === 'normal' && s.turn.roundNumber > roundCap) {
      hitCap = true;
      break;
    }
    if (actions >= maxActions) throw failure(`no end after ${actions} actions`);
    const legal = legalActions(s);
    if (legal.length === 0) throw failure(`no legal action in ${s.flow.phase}`);
    const actor = decisionMaker(s);
    if (actor === null) throw failure('no decision-maker');
    const action = chooseAction(bots[actor] as BotKind, {
      state: s,
      legal,
      actor,
      rnd,
      freeActionsTaken: actor === freeActor ? freeCount : 0,
    });
    if (isFreeAction(action.type)) {
      freeCount = actor === freeActor ? freeCount + 1 : 1;
      freeActor = actor;
    } else if (action.type !== 'respondTrade') {
      freeActor = -1;
      freeCount = 0;
    }
    const result = reduce(s, action);
    recent.push(action);
    if (recent.length > 50) recent.shift();
    if (result.error) throw failure(`bot chose an illegal action ${action.type}: ${result.error.reason}`);
    s = result.state;
    actions++;
    actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1;
    phases.add(s.flow.phase);
    if (check) {
      const broken = checkInvariants(s);
      if (broken.length > 0) throw failure(`invariant failed after ${action.type}: ${broken.join('; ')}`);
    }
  }

  return {
    seed,
    mode,
    rounds: hitCap ? roundCap : s.turn.roundNumber,
    finished: s.flow.phase === 'GameOver',
    hitCap,
    houses: s.meta.stats.housesBuilt,
    hotels: s.meta.stats.hotelsBuilt,
    bankruptcies: s.meta.stats.bankruptcies,
    actions,
    winners: s.meta.winner ?? [],
    bots,
    endReason: hitCap ? 'roundCap' : (s.meta.endReason ?? 'none'),
    actionCounts,
    phases: [...phases],
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export interface ModeSummary {
  games: number;
  medianRounds: number;
  capShare: number;
  housesPerGame: number;
  hotelsPerGame: number;
  bankruptciesPerGame: number;
  actionsPerGame: number;
  sensibleWinShare: number;
  endReasons: Record<string, number>;
  actionTotals: Record<string, number>;
  phasesSeen: string[];
}

export function summarize(results: GameResult[]): ModeSummary {
  const n = results.length || 1;
  const sum = (f: (r: GameResult) => number) => results.reduce((t, r) => t + f(r), 0);
  const decided = results.filter((r) => r.winners.length > 0);
  const sensibleWins = decided.filter((r) => r.winners.every((w) => r.bots[w] === 'sensible')).length;
  return {
    games: results.length,
    medianRounds: median(results.map((r) => r.rounds)),
    capShare: sum((r) => (r.hitCap ? 1 : 0)) / n,
    housesPerGame: sum((r) => r.houses) / n,
    hotelsPerGame: sum((r) => r.hotels) / n,
    bankruptciesPerGame: sum((r) => r.bankruptcies) / n,
    actionsPerGame: sum((r) => r.actions) / n,
    sensibleWinShare: decided.length ? sensibleWins / decided.length : 0,
    endReasons: tally(results.map((r) => r.endReason)),
    actionTotals: results.reduce<Record<string, number>>((acc, r) => {
      for (const [k, v] of Object.entries(r.actionCounts)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {}),
    phasesSeen: [...new Set(results.flatMap((r) => r.phases))].sort(),
  };
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
