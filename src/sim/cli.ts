// `npm run sim`: 200 Quick + 200 Normal seeded games with 4 bots, invariants checked after every
// action. Prints a summary and writes reports/sim-report.json.
// Options: --quick N --normal N --seed S (first seed) --out PATH
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SIM } from '../data/balance';
import { SimulationFailure, simulateGame, summarize, type GameResult, type ModeSummary } from './runner';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function argText(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

function format(label: string, m: ModeSummary): string {
  return [
    `${label}: ${m.games} games`,
    `  median rounds          ${m.medianRounds}`,
    `  hit the round cap      ${(m.capShare * 100).toFixed(1)}%`,
    `  houses built per game  ${m.housesPerGame.toFixed(2)}`,
    `  hotels built per game  ${m.hotelsPerGame.toFixed(2)}`,
    `  bankruptcies per game  ${m.bankruptciesPerGame.toFixed(2)}`,
    `  actions per game       ${Math.round(m.actionsPerGame)}`,
    `  won by a sensible bot  ${(m.sensibleWinShare * 100).toFixed(1)}%`,
    `  end reasons            ${JSON.stringify(m.endReasons)}`,
    `  phases reached         ${m.phasesSeen.length} of 12`,
  ].join('\n');
}

function main(): void {
  const quickGames = arg('quick', SIM.quickGames);
  const normalGames = arg('normal', SIM.normalGames);
  const firstSeed = arg('seed', 1);
  const out = resolve(argText('out', 'reports/sim-report.json'));
  const started = Date.now();
  const results: GameResult[] = [];
  const plan: Array<{ seed: number; mode: 'quick' | 'normal' }> = [
    ...Array.from({ length: quickGames }, (_, i) => ({ seed: firstSeed + i, mode: 'quick' as const })),
    ...Array.from({ length: normalGames }, (_, i) => ({ seed: firstSeed + i, mode: 'normal' as const })),
  ];
  for (const [i, game] of plan.entries()) {
    try {
      results.push(simulateGame(game.seed, game.mode));
    } catch (error) {
      if (error instanceof SimulationFailure) {
        console.error(`FAILED ${error.mode} game, seed ${error.seed}: ${error.message}`);
        console.error(`last actions: ${JSON.stringify(error.lastActions)}`);
      } else {
        console.error(`CRASH in ${game.mode} game, seed ${game.seed}:`, error);
      }
      process.exitCode = 1;
      return;
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${plan.length} games\n`);
  }
  const quick = summarize(results.filter((r) => r.mode === 'quick'));
  const normal = summarize(results.filter((r) => r.mode === 'normal'));
  const seconds = (Date.now() - started) / 1000;
  const report = {
    generatedAt: new Date().toISOString(),
    seconds,
    players: SIM.playersPerGame,
    bots: 'two sensible and two random bots per game (seats alternate by seed)',
    normalRoundCap: SIM.normalRoundCap,
    gamesCompleted: results.length,
    invariantFailures: 0,
    crashes: 0,
    quick,
    normal,
    games: results.map(({ actionCounts: _counts, phases: _phases, ...rest }) => rest),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(format('Quick (round limit 50)', quick));
  console.log(format(`Normal (cap ${SIM.normalRoundCap} rounds)`, normal));
  console.log(`${results.length} games, no crash, no invariant failure, ${seconds.toFixed(1)} s. Report: ${out}`);
}

main();
