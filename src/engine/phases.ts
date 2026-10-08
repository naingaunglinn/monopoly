// Turn flow (spec 5.2): turn start, rolls, movement, landing, Jail, Vacation, turn passing and
// game end. Every function here works on a draft inside reduce().
import { BALANCE, BOARD_SIZE, SPACES } from '../data/balance.js';
import { BOARD, propertyKind } from '../data/board.js';
import { startAuction } from './auction.js';
import { discardCard, drawCard } from './cards.js';
import {
  type Ctx,
  changeCash,
  countryOf,
  currentPlayer,
  emit,
  nextLivingSeat,
  ownsCountry,
  playerById,
  prop,
} from './core.js';
import { queueDebt, settleDebts } from './debt.js';
import { computeWinners } from './networth.js';
import { airportRent, cityRent } from './rent.js';
import { rollDie } from './rng.js';
import type { Dice, EndReason, GameState, RentDue } from './types.js';

/** Two dice from the seeded generator, unless the debug panel queued the next roll. */
export function rollDice(c: Ctx): Dice {
  const forced = c.s.meta.forcedDice.shift();
  if (forced) return [forced[0], forced[1]];
  return [rollDie(c.s), rollDie(c.s)];
}

// ---------------------------------------------------------------------------------------------
// Turns and rounds

export function beginTurn(c: Ctx, seat: number): void {
  const s = c.s;
  s.turn.currentPlayerIndex = seat;
  s.turn.doublesCount = 0;
  s.turn.landedCity = null;
  s.turn.rollsLeft = 1;
  s.turn.dice = null;
  s.turn.turnNumber += 1;
  const p = currentPlayer(s);
  s.turn.recap = p.recap;
  p.recap = [];
  emit(c, { type: 'turnStarted', player: seat });

  // A modifier lasts until the drawing player's next turn begins (spec section 6).
  const expired = s.flow.modifiers.filter((m) => m.drawnBy === seat);
  if (expired.length > 0) {
    s.flow.modifiers = s.flow.modifiers.filter((m) => m.drawnBy !== seat);
    for (const modifier of expired) emit(c, { type: 'modifierEnded', modifier });
  }

  s.flow.pending = null;
  if (s.meta.settings.passDevice) {
    s.flow.phase = 'PassDevice';
    return;
  }
  enterTurnStart(c);
}

/** After the pass-device screen: Vacation notice, Jail choices, or straight to rolling. */
export function enterTurnStart(c: Ctx): void {
  const s = c.s;
  const p = currentPlayer(s);
  if (p.skipNextTurn) {
    s.flow.phase = 'TurnStart';
    s.flow.pending = { kind: 'vacationSkip' };
  } else if (p.inJail) {
    s.flow.phase = 'TurnStart';
    s.flow.pending = { kind: 'jailChoice' };
  } else {
    s.flow.phase = 'AwaitRoll';
    s.flow.pending = null;
  }
}

/** True when moving the turn from `from` to `next` reaches the seat that opens each round. */
function wrapsRound(s: GameState, from: number, next: number): boolean {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const seat = (from + k) % n;
    if (seat === s.turn.roundStartSeat) return true;
    if (seat === next) return false;
  }
  return false;
}

/** The turn passes to the next living player; a completed round may end a Quick game. */
export function passTurn(c: Ctx): void {
  const s = c.s;
  const from = s.turn.currentPlayerIndex;
  const next = nextLivingSeat(s, from);
  if (next === null) {
    endGame(c, 'lastPlayer');
    return;
  }
  if (wrapsRound(s, from, next)) {
    if (s.meta.settings.mode === 'quick' && s.turn.roundNumber >= s.meta.settings.roundLimit) {
      endGame(c, 'roundLimit');
      return;
    }
    s.turn.roundNumber += 1;
    emit(c, { type: 'roundStarted', round: s.turn.roundNumber });
  }
  beginTurn(c, next);
}

export function endGame(c: Ctx, reason: EndReason): void {
  const s = c.s;
  // A card still face up (the game ended while it was shown) goes to its discard pile.
  if (s.flow.pending?.kind === 'card') discardCard(s, s.flow.pending.cardId);
  s.flow.phase = 'GameOver';
  s.flow.pending = null;
  s.flow.trade = null;
  s.flow.debts = [];
  s.flow.resume = null;
  s.turn.landedCity = null;
  s.turn.rollsLeft = 0;
  const winners = computeWinners(s);
  s.meta.winner = winners;
  s.meta.endReason = reason;
  emit(c, { type: 'gameOver', winners, reason });
}

// ---------------------------------------------------------------------------------------------
// Rolling and moving

export function movementRoll(c: Ctx): void {
  const s = c.s;
  const p = currentPlayer(s);
  // Build permission lasts until the player rolls again (5.8).
  s.turn.landedCity = null;
  s.turn.rollsLeft -= 1;
  const dice = rollDice(c);
  const doubles = dice[0] === dice[1];
  s.turn.dice = dice;
  emit(c, { type: 'diceRolled', player: p.id, dice, purpose: 'move', doubles });
  if (doubles) {
    s.turn.doublesCount += 1;
    if (s.turn.doublesCount >= BALANCE.doublesToJail) {
      // The third double does not move the token (5.3).
      sendToJail(c, 'doubles');
      return;
    }
    s.turn.rollsLeft += 1;
  }
  moveSteps(c, p.id, dice[0] + dice[1], 'dice');
}

/** Moves one space at a time. Forward moves pay $500 for passing or landing on World Start. */
export function moveSteps(c: Ctx, playerId: number, steps: number, by: 'dice' | 'card'): void {
  const p = playerById(c.s, playerId);
  const direction: 1 | -1 = steps >= 0 ? 1 : -1;
  const from = p.position;
  const path: number[] = [];
  let pos = from;
  let passedStart = false;
  for (let i = 0; i < Math.abs(steps); i++) {
    pos = (pos + direction + BOARD_SIZE) % BOARD_SIZE;
    path.push(pos);
    if (direction === 1 && pos === SPACES.start) passedStart = true;
  }
  p.position = pos;
  emit(c, { type: 'moved', player: playerId, from, to: pos, path, direction, by });
  if (passedStart) {
    changeCash(c, playerId, BALANCE.startBonus, 'start');
    emit(c, { type: 'passedStart', player: playerId, amount: BALANCE.startBonus });
  }
  resolveLanding(c);
}

/** Moves straight to a space without passing World Start (Jail, Vacation). */
export function teleport(c: Ctx, playerId: number, to: number, reason: 'jail' | 'vacation' | 'debug'): void {
  const p = playerById(c.s, playerId);
  const from = p.position;
  p.position = to;
  emit(c, { type: 'teleported', player: playerId, from, to, reason });
}

// ---------------------------------------------------------------------------------------------
// Landing (5.4)

export function resolveLanding(c: Ctx): void {
  const s = c.s;
  const p = currentPlayer(s);
  const space = BOARD[p.position];
  if (!space) throw new Error(`Bad position ${p.position}`);
  emit(c, { type: 'landed', player: p.id, space: space.index });
  if (space.type === 'city') s.turn.landedCity = space.index;

  switch (space.type) {
    case 'city':
    case 'airport':
    case 'company':
      resolveProperty(c, space.index);
      return;
    case 'chance':
      if (s.meta.settings.chance) drawCard(c, 'chance');
      else afterResolution(c);
      return;
    case 'event':
      if (s.meta.settings.event) drawCard(c, 'event');
      else afterResolution(c);
      return;
    case 'tax': {
      const amount = space.tax === 'income' ? BALANCE.incomeTax : BALANCE.luxuryTax;
      setRentDue(c, {
        space: space.index,
        payer: p.id,
        creditor: null,
        amount,
        calc: { kind: 'tax', tax: space.tax },
        freeStayAllowed: false,
      });
      return;
    }
    case 'goToJail':
      sendToJail(c, 'space');
      return;
    case 'vacation':
      if (s.meta.settings.vacation) startVacation(c, p.id);
      afterResolution(c);
      return;
    default:
      // World Start (paid while moving), Jail (just visiting), Free Parking.
      afterResolution(c);
  }
}

function resolveProperty(c: Ctx, space: number): void {
  const s = c.s;
  const p = currentPlayer(s);
  const ps = prop(s, space);
  if (ps.owner === null) {
    s.flow.phase = 'BuyDecision';
    s.flow.pending = { kind: 'buy', space };
    return;
  }
  if (ps.owner === p.id) {
    afterResolution(c);
    return;
  }
  if (ps.mortgaged) {
    emit(c, { type: 'noRent', player: p.id, space, owner: ps.owner });
    afterResolution(c);
    return;
  }
  const kind = propertyKind(space);
  if (kind === 'company') {
    s.flow.phase = 'CompanyRoll';
    s.flow.pending = { kind: 'companyRoll', space, owner: ps.owner };
    return;
  }
  const quote = kind === 'city' ? cityRent(s, space) : airportRent(s, space);
  setRentDue(c, {
    space,
    payer: p.id,
    creditor: ps.owner,
    amount: quote.amount,
    calc: quote.calc,
    freeStayAllowed: kind === 'city' && s.meta.settings.freeStay && p.freeStay > 0,
  });
}

export function setRentDue(c: Ctx, rent: RentDue): void {
  c.s.flow.phase = 'RentDue';
  c.s.flow.pending = { kind: 'rent', rent };
}

/** Pays rent or a tax through the debt queue, so the Debt phase opens when cash is short. */
export function payRentDue(c: Ctx, rent: RentDue): void {
  const tax = rent.calc.kind === 'tax' ? rent.calc.tax : null;
  c.s.flow.pending = null;
  queueDebt(c, {
    debtor: rent.payer,
    creditor: rent.creditor,
    amount: rent.amount,
    reason: tax ? { kind: 'tax', tax } : { kind: 'rent', space: rent.space },
  });
  c.s.flow.resume = { kind: 'afterResolution' };
  settleDebts(c);
}

/** True when the current player stands on their own city in a complete country (step 7). */
export function canOfferBuild(s: GameState): boolean {
  const space = s.turn.landedCity;
  if (space === null) return false;
  const p = currentPlayer(s);
  if (p.position !== space || p.inJail) return false;
  const ps = s.properties[space];
  const country = countryOf(space);
  if (!ps || country === null || ps.owner !== p.id) return false;
  return ownsCountry(s, p.id, country) && ps.level < BALANCE.hotelLevel;
}

/** The landing is fully resolved: offer building, then continue the turn. */
export function afterResolution(c: Ctx): void {
  const s = c.s;
  if (canOfferBuild(s)) {
    s.flow.phase = 'BuildOffer';
    s.flow.pending = { kind: 'build', space: s.turn.landedCity as number };
    return;
  }
  endOfMove(c);
}

/** Step 9: another roll after doubles (or a Roll again card), otherwise End turn. */
export function endOfMove(c: Ctx): void {
  const s = c.s;
  s.flow.pending = null;
  s.flow.phase = s.turn.rollsLeft > 0 && !currentPlayer(s).inJail ? 'AwaitRoll' : 'AwaitEndTurn';
}

// ---------------------------------------------------------------------------------------------
// Jail (5.11) and Vacation (5.12)

export function sendToJail(c: Ctx, reason: 'space' | 'card' | 'doubles'): void {
  const s = c.s;
  const p = currentPlayer(s);
  teleport(c, p.id, SPACES.jail, 'jail');
  p.inJail = true;
  p.jailAttempts = 0;
  // The turn ends; doubles and extra rolls are ignored.
  s.turn.rollsLeft = 0;
  s.turn.landedCity = null;
  emit(c, { type: 'jailed', player: p.id, reason });
  s.flow.phase = 'AwaitEndTurn';
  s.flow.pending = null;
}

export function leaveJail(c: Ctx, how: 'fine' | 'card' | 'doubles' | 'forcedFine'): void {
  const p = currentPlayer(c.s);
  p.inJail = false;
  p.jailAttempts = 0;
  emit(c, { type: 'leftJail', player: p.id, how });
}

export function startVacation(c: Ctx, playerId: number): void {
  const p = playerById(c.s, playerId);
  p.skipNextTurn = true;
  emit(c, { type: 'vacationStarted', player: playerId });
  c.s.flow.notices.push({ kind: 'vacation', player: playerId });
}

export function payJailFine(c: Ctx): void {
  const p = currentPlayer(c.s);
  changeCash(c, p.id, -BALANCE.jailFine, 'jailFine');
  emit(c, { type: 'feePaid', player: p.id, amount: BALANCE.jailFine, reason: 'jailFine' });
  leaveJail(c, 'fine');
  c.s.flow.phase = 'AwaitRoll';
  c.s.flow.pending = null;
}

export function rollForDoubles(c: Ctx): void {
  const s = c.s;
  const p = currentPlayer(s);
  s.turn.rollsLeft = 0;
  s.flow.pending = null;
  const dice = rollDice(c);
  const doubles = dice[0] === dice[1];
  const total = dice[0] + dice[1];
  s.turn.dice = dice;
  emit(c, { type: 'diceRolled', player: p.id, dice, purpose: 'jail', doubles });
  if (doubles) {
    // Leave and move that total, with no extra roll.
    leaveJail(c, 'doubles');
    moveSteps(c, p.id, total, 'dice');
    return;
  }
  p.jailAttempts += 1;
  emit(c, { type: 'jailRollFailed', player: p.id, attempts: p.jailAttempts });
  if (p.jailAttempts >= BALANCE.jailMaxAttempts) {
    // Third failed roll: the fine is forced (debt rules apply), then the player moves that total.
    queueDebt(c, { debtor: p.id, creditor: null, amount: BALANCE.jailFine, reason: { kind: 'jailFine' } });
    s.flow.resume = { kind: 'jailMove', total };
    settleDebts(c);
    return;
  }
  s.flow.phase = 'AwaitEndTurn';
}

// ---------------------------------------------------------------------------------------------
// Buying (5.5)

export function buyProperty(c: Ctx, space: number): void {
  const s = c.s;
  const p = currentPlayer(s);
  const ps = prop(s, space);
  const price = priceOf(space);
  changeCash(c, p.id, -price, 'buy', { space });
  ps.owner = p.id;
  emit(c, { type: 'bought', player: p.id, space, price });
  s.flow.pending = null;
  afterResolution(c);
}

export function declineProperty(c: Ctx, space: number): void {
  const s = c.s;
  emit(c, { type: 'declined', player: s.turn.currentPlayerIndex, space });
  s.flow.pending = null;
  if (s.meta.settings.auction) startAuction(c, space);
  else afterResolution(c);
}

function priceOf(space: number): number {
  const sp = BOARD[space];
  if (sp?.type === 'city') return sp.city.price;
  if (sp?.type === 'airport') return sp.airport.price;
  if (sp?.type === 'company') return sp.company.price;
  throw new Error(`Space ${space} has no price`);
}
