// Invariants checked after every simulated action (spec section 15) and when loading a save.
import { BALANCE, BOARD_SIZE } from '../data/balance.js';
import { COUNTRIES, COUNTRY_CITIES, isProperty } from '../data/board.js';
import { cardsForSettings } from './cards.js';
import { legalActions } from './legal.js';
import { PHASES, type GameState, type Pending } from './types.js';

const PENDING_FOR_PHASE: Readonly<Record<GameState['flow']['phase'], readonly (Pending['kind'] | null)[]>> = {
  PassDevice: [null],
  TurnStart: ['jailChoice', 'vacationSkip'],
  AwaitRoll: [null],
  BuyDecision: ['buy'],
  Auction: ['auction'],
  RentDue: ['rent'],
  CompanyRoll: ['companyRoll'],
  CardReveal: ['card'],
  BuildOffer: ['build'],
  Debt: ['debt'],
  AwaitEndTurn: [null],
  GameOver: [null],
};

/** Returns a list of violated invariants (empty when the state is sound). */
export function checkInvariants(s: GameState, options: { legalActions?: boolean } = {}): string[] {
  const errors: string[] = [];
  const phase = s.flow.phase;

  if (!PHASES.includes(phase)) errors.push(`invalid phase ${String(phase)}`);
  else if (!PENDING_FOR_PHASE[phase].includes(s.flow.pending?.kind ?? null)) {
    errors.push(`phase ${phase} has pending ${s.flow.pending?.kind ?? 'null'}`);
  }
  if (phase === 'Debt' && s.flow.debts.length === 0) errors.push('Debt phase without a debt');

  for (const p of s.players) {
    if (!Number.isInteger(p.cash)) errors.push(`${p.name} cash is not a whole number: ${p.cash}`);
    if (p.cash < 0 && phase !== 'Debt') errors.push(`${p.name} has negative cash ${p.cash} outside Debt`);
    if (p.position < 0 || p.position >= BOARD_SIZE) errors.push(`${p.name} position ${p.position}`);
    if (p.freeStay < 0 || p.freeStay > BALANCE.freeStayMax) errors.push(`${p.name} holds ${p.freeStay} Free Stay`);
    if (p.bankrupt && p.cash !== 0) errors.push(`bankrupt ${p.name} has cash`);
  }
  const current = s.players[s.turn.currentPlayerIndex];
  if (!current) errors.push('no current player');
  else if (current.bankrupt && phase !== 'GameOver') {
    // Allowed only while other players settle their share of the same card before the turn passes.
    const waitingToPass = phase === 'Debt' && s.flow.resume?.kind === 'passTurn';
    if (!waitingToPass) errors.push('current player is bankrupt');
  }

  s.properties.forEach((ps, space) => {
    if (isProperty(space) !== (ps !== null)) {
      errors.push(`property slot mismatch at ${space}`);
      return;
    }
    if (!ps) return;
    if (ps.owner !== null) {
      const owner = s.players[ps.owner];
      if (!owner) errors.push(`space ${space} owned by unknown player ${ps.owner}`);
      else if (owner.bankrupt) errors.push(`space ${space} owned by bankrupt ${owner.name}`);
    } else if (ps.mortgaged || ps.level !== 0) {
      errors.push(`unowned space ${space} is mortgaged or built`);
    }
    if (!Number.isInteger(ps.level) || ps.level < 0 || ps.level > BALANCE.hotelLevel) {
      errors.push(`space ${space} has level ${ps.level}`);
    }
  });

  for (const country of COUNTRIES) {
    const spaces = COUNTRY_CITIES[country.id];
    const levels = spaces.map((sp) => s.properties[sp]?.level ?? 0);
    const built = levels.some((l) => l > 0);
    if (!built) continue;
    const owners = new Set(spaces.map((sp) => s.properties[sp]?.owner ?? null));
    if (owners.size !== 1 || owners.has(null)) errors.push(`${country.name} has buildings without one owner`);
    if (Math.max(...levels) - Math.min(...levels) > 1) errors.push(`${country.name} breaks the even rule: ${levels}`);
    if (spaces.some((sp) => s.properties[sp]?.mortgaged)) errors.push(`${country.name} has buildings and a mortgage`);
  }
  // Airports and companies never have buildings.
  s.properties.forEach((ps, space) => {
    if (ps && ps.level > 0 && !Object.values(COUNTRY_CITIES).some((list) => list.includes(space))) {
      errors.push(`non-city ${space} has buildings`);
    }
  });

  // Every card in play is in exactly one place: a deck, a discard pile, a hand, or on the table.
  for (const deck of ['chance', 'event'] as const) {
    const expected = cardsForSettings(deck, s.meta.settings).map((card) => card.id);
    const seen: string[] = [
      ...(deck === 'chance' ? s.decks.chanceDeck : s.decks.eventDeck),
      ...(deck === 'chance' ? s.decks.chanceDiscard : s.decks.eventDiscard),
      ...s.players.flatMap((p) => [...p.jailCards, ...p.houseVouchers]).filter((id) => id.startsWith(`${deck}-`)),
    ];
    if (s.flow.pending?.kind === 'card' && s.flow.pending.deck === deck) seen.push(s.flow.pending.cardId);
    const sortedSeen = [...seen].sort();
    const sortedExpected = [...expected].sort();
    if (sortedSeen.length !== sortedExpected.length || sortedSeen.some((id, i) => id !== sortedExpected[i])) {
      errors.push(`${deck} cards are not conserved (${seen.length} seen, ${expected.length} expected)`);
    }
  }

  if (options.legalActions !== false && phase !== 'GameOver' && legalActions(s).length === 0) {
    errors.push(`no legal action in ${phase}`);
  }
  return errors;
}
