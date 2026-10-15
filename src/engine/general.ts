// Rank, the general and unrest on the Myanmar map (owner's spec v2 sections 5 and 6, D107).
// Serving in the army raises a player's rank; the highest rank of 4 or more is the general, whose
// power (once in two rounds) takes 1,000 lakh or a property from a player. After every use, the
// other players may show unrest cups; three cups bring the general down. Bribes buy silence.
import { MYANMAR } from '../data/balance.js';
import { CITY_BY_SPACE, COUNTRY_CITIES, RULES } from '../data/board.js';
import { countryOf, emit, livingPlayers, playerById, transfer, changeCash, currentPlayer, type Ctx } from './core.js';
import { queueDebt, settleDebts } from './debt.js';
import { isPledged } from './loans.js';
import { afterResolution, rollDice } from './phases.js';
import { rollDie } from './rng.js';
import type { GameState, Player, PowerOutcome } from './types.js';

/** Serving ends with one die: even raises the rank by 2, odd by 1 (at most 6); then the salary. */
export function promote(c: Ctx, p: Player): void {
  const s = c.s;
  const forced = s.meta.forcedDice.shift();
  const die = forced ? forced[0] : rollDie(s);
  const rank = Math.min(MYANMAR.rankMax, p.rank + (die % 2 === 0 ? MYANMAR.rankEven : MYANMAR.rankOdd));
  if (rank > p.rank) {
    s.economy.rankSeq += 1;
    p.rankAt = s.economy.rankSeq;
    p.rank = rank;
  }
  const salary = p.rank * MYANMAR.salaryPerRank;
  changeCash(c, p.id, salary, 'salary');
  emit(c, { type: 'promoted', player: p.id, die, rank: p.rank, salary });
  updateGeneral(c);
}

/** A player with a rank draws rank × 200 lakh each time they pass Start (D109). */
export function startSalary(c: Ctx, playerId: number): void {
  if (!RULES.general) return;
  const p = playerById(c.s, playerId);
  if (p.rank <= 0) return;
  const amount = p.rank * MYANMAR.salaryPerRank;
  changeCash(c, p.id, amount, 'salary');
  emit(c, { type: 'salaryPaid', player: p.id, amount });
}

/** Everyone gets their cups back, and the new general starts afresh. */
function freshTerm(s: GameState): void {
  for (const p of s.players) p.unrest = MYANMAR.unrestCups;
  s.economy.unrestUsed = 0;
  s.economy.bribed = [];
  s.economy.powerRound = null;
}

/**
 * The general is the one player with the highest rank, 4 or more. Of equal ranks the one who got
 * there first stays (or becomes) general; someone who climbs higher takes over.
 */
export function updateGeneral(c: Ctx): void {
  const s = c.s;
  if (!RULES.general) return;
  const before = s.economy.general;
  const ranked = livingPlayers(s).filter((p) => p.rank >= MYANMAR.generalMinRank);
  const top = Math.max(0, ...ranked.map((p) => p.rank));
  let next: number | null = null;
  const current = before !== null ? ranked.find((p) => p.id === before) : undefined;
  if (current && current.rank === top) next = current.id;
  else {
    const first = ranked.filter((p) => p.rank === top).sort((a, b) => a.rankAt - b.rankAt)[0];
    next = first ? first.id : null;
  }
  if (next === before) return;
  s.economy.general = next;
  freshTerm(s);
  emit(c, { type: 'generalChanged', player: next, previous: before });
}

/** The general's power is ready: on their own turn, between decisions, once in two rounds. */
export function powerReady(s: GameState): boolean {
  const general = s.economy.general;
  if (!RULES.general || general === null || general !== s.turn.currentPlayerIndex) return false;
  if (s.flow.phase !== 'AwaitRoll' && s.flow.phase !== 'AwaitEndTurn') return false;
  if (s.flow.notices.length > 0 || s.flow.trade !== null || s.flow.loan !== null) return false;
  const p = s.players[general];
  if (!p || p.bankrupt || p.rank < MYANMAR.generalMinRank) return false;
  const last = s.economy.powerRound;
  return last === null || s.turn.roundNumber - last >= MYANMAR.powerEveryRounds;
}

/**
 * Properties the power may take from `from`: no buildings, not pledged for a loan, and no city in
 * a region with buildings (the rest of the region would be left with houses it does not own whole).
 */
export function seizable(s: GameState, from: number): number[] {
  const out: number[] = [];
  s.properties.forEach((ps, space) => {
    if (!ps || ps.owner !== from || ps.level > 0 || isPledged(s, space)) return;
    const country = CITY_BY_SPACE.has(space) ? countryOf(space) : null;
    if (country !== null && COUNTRY_CITIES[country].some((sp) => (s.properties[sp]?.level ?? 0) > 0)) return;
    out.push(space);
  });
  return out;
}

/** The power: two dice, up to 8 money, above 8 land. The general then picks the target. */
export function usePower(c: Ctx): void {
  const s = c.s;
  const general = currentPlayer(s);
  const dice = rollDice(c);
  const outcome: PowerOutcome = dice[0] + dice[1] <= MYANMAR.powerMoneyUpTo ? 'money' : 'land';
  s.economy.powerRound = s.turn.roundNumber;
  emit(c, { type: 'diceRolled', player: general.id, dice, purpose: 'power', doubles: false });
  emit(c, { type: 'powerRolled', player: general.id, dice, outcome });
  const others = livingPlayers(s).filter((p) => p.id !== general.id);
  if (outcome === 'land' && !others.some((p) => seizable(s, p.id).length > 0)) {
    emit(c, { type: 'powerFizzled', player: general.id });
    return;
  }
  s.flow.phase = 'BuyDecision';
  s.flow.pending = { kind: 'powerTarget', outcome, dice };
}

/** Who answers in the unrest window: players with a cup left and not bribed, and the target if they can block. */
function windowPlayers(s: GameState, target: number): number[] {
  const general = s.economy.general;
  return livingPlayers(s)
    .filter((p) => p.id !== general)
    .filter(
      (p) => (p.unrest > 0 && !s.economy.bribed.includes(p.id)) || (p.id === target && p.merit >= MYANMAR.powerBlockMerit),
    )
    .map((p) => p.id);
}

/** The target is chosen: everyone else may now show unrest (the window). */
export function setPowerTarget(c: Ctx, target: number, space: number | null): void {
  const s = c.s;
  const pending = s.flow.pending;
  if (pending?.kind !== 'powerTarget') return;
  const general = s.turn.currentPlayerIndex;
  emit(c, { type: 'powerTargeted', player: general, target, space, outcome: pending.outcome });
  s.flow.pending = {
    kind: 'unrest',
    outcome: pending.outcome,
    target,
    space,
    waiting: windowPlayers(s, target),
    used: [],
    blocked: false,
  };
  if ((s.flow.pending.waiting as number[]).length === 0) resolveUnrest(c);
}

export function answerUnrest(c: Ctx, playerId: number, use: boolean, block: boolean): void {
  const s = c.s;
  const pending = s.flow.pending;
  if (pending?.kind !== 'unrest') return;
  const p = playerById(s, playerId);
  if (use) {
    p.unrest -= 1;
    pending.used.push(playerId);
    s.economy.unrestUsed += 1;
  }
  if (block) {
    p.merit -= MYANMAR.powerBlockMerit;
    pending.blocked = true;
  }
  pending.waiting = pending.waiting.filter((id) => id !== playerId);
  emit(c, { type: 'unrestAnswered', player: playerId, use, block });
  if (pending.waiting.length === 0) resolveUnrest(c);
}

/** Cups that bring the general down: 3, or as many as the others hold if fewer (two players). */
export function unrestToDepose(s: GameState): number {
  const others = livingPlayers(s).filter((p) => p.id !== s.economy.general).length;
  return Math.min(MYANMAR.unrestToDepose, others * MYANMAR.unrestCups);
}

/** All have answered: the general falls (the use is cancelled), or it is blocked, or it happens. */
export function resolveUnrest(c: Ctx): void {
  const s = c.s;
  const pending = s.flow.pending;
  if (pending?.kind !== 'unrest') return;
  const general = s.economy.general;
  s.flow.pending = null;
  s.economy.bribed = [];
  if (general === null) {
    afterResolution(c);
    return;
  }
  if (s.economy.unrestUsed >= unrestToDepose(s)) {
    const g = playerById(s, general);
    const used = s.economy.unrestUsed;
    g.rank = 0;
    g.rankAt = 0;
    s.economy.general = null;
    freshTerm(s);
    emit(c, { type: 'generalDeposed', player: general, used });
    updateGeneral(c);
    afterResolution(c);
    return;
  }
  if (pending.blocked) {
    emit(c, { type: 'powerBlocked', player: general, target: pending.target });
    afterResolution(c);
    return;
  }
  if (pending.outcome === 'land' && pending.space !== null) {
    const ps = s.properties[pending.space];
    if (ps && ps.owner === pending.target) {
      ps.owner = general;
      emit(c, { type: 'powerSeized', from: pending.target, to: general, space: pending.space });
    }
    afterResolution(c);
    return;
  }
  queueDebt(c, { debtor: pending.target, creditor: general, amount: MYANMAR.powerMoney, reason: { kind: 'power' } });
  s.flow.resume = { kind: 'afterResolution' };
  settleDebts(c);
}

/** The general offers a player money not to show unrest at the next use of power. */
export function offerBribe(c: Ctx, to: number, amount: number): void {
  const s = c.s;
  s.flow.phase = 'BuyDecision';
  s.flow.pending = { kind: 'bribe', to, amount };
  emit(c, { type: 'bribeOffered', from: s.turn.currentPlayerIndex, to, amount });
}

export function respondBribe(c: Ctx, accept: boolean): void {
  const s = c.s;
  const pending = s.flow.pending;
  if (pending?.kind !== 'bribe') return;
  const from = s.turn.currentPlayerIndex;
  s.flow.pending = null;
  if (accept) {
    transfer(c, from, pending.to, pending.amount, 'bribe');
    s.economy.bribed.push(pending.to);
  }
  emit(c, { type: 'bribeAnswered', from, to: pending.to, amount: pending.amount, accept });
  afterResolution(c);
}

/** A player leaves the game (bankrupt): rank and the general are worked out again. */
export function bankruptGeneral(c: Ctx, playerId: number): void {
  const s = c.s;
  const p = playerById(s, playerId);
  p.rank = 0;
  p.rankAt = 0;
  p.unrest = 0;
  s.economy.bribed = s.economy.bribed.filter((id) => id !== playerId);
  updateGeneral(c);
}
