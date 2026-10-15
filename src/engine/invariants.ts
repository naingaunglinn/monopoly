// Invariants checked after every simulated action (spec section 15) and when loading a save.
import { BALANCE, MYANMAR } from '../data/balance.js';
import { COUNTRIES, COUNTRY_CITIES, isProperty, LAYOUT, RULES, useMap } from '../data/board.js';
import { cardsForSettings } from './cards.js';
import { legalActions } from './legal.js';
import { loanOwed, loanPartiesAlive } from './loans.js';
import { PHASES, type GameState, type Pending } from './types.js';

const PENDING_FOR_PHASE: Readonly<Record<GameState['flow']['phase'], readonly (Pending['kind'] | null)[]>> = {
  PassDevice: [null],
  TurnStart: ['jailChoice', 'vacationSkip', 'draftChoice', 'draftSkip'],
  AwaitRoll: [null],
  BuyDecision: ['buy', 'donation', 'powerTarget', 'unrest', 'bribe'],
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
  useMap(s);
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
    if (p.position < 0 || p.position >= LAYOUT.size) errors.push(`${p.name} position ${p.position}`);
    if (p.freeStay < 0 || p.freeStay > BALANCE.freeStayMax) errors.push(`${p.name} holds ${p.freeStay} Free Stay`);
    if (p.bankrupt && p.cash !== 0) errors.push(`bankrupt ${p.name} has cash`);
    if (!Number.isInteger(p.merit) || p.merit < 0 || p.merit > MYANMAR.meritMax) errors.push(`${p.name} holds ${p.merit} merit`);
    if (p.draft && (!Number.isInteger(p.draft.turns) || p.draft.turns < 1)) errors.push(`${p.name} has ${p.draft.turns} turns of service left`);
    if (!RULES.conscription && (p.draft !== null || p.merit !== 0)) errors.push(`${p.name} has military service or merit on this map`);
    if (!Number.isInteger(p.rank) || p.rank < 0 || p.rank > MYANMAR.rankMax) errors.push(`${p.name} has rank ${p.rank}`);
    if (!Number.isInteger(p.unrest) || p.unrest < 0 || p.unrest > MYANMAR.unrestCups) errors.push(`${p.name} holds ${p.unrest} unrest cups`);
    if (!RULES.general && p.rank !== 0) errors.push(`${p.name} has a rank on this map`);
  }
  if (!Number.isInteger(s.economy.pot) || s.economy.pot < 0) errors.push(`the pot holds ${s.economy.pot}`);
  // Myanmar map loans (D104): live parties, collateral the borrower holds unmortgaged, never pledged twice.
  if (!RULES.loans && (s.economy.loans.length > 0 || s.flow.loan !== null)) errors.push('loans on a map without them');
  const pledged = new Set<number>();
  for (const loan of s.economy.loans) {
    if (!loanPartiesAlive(s, loan)) errors.push(`loan ${loan.id} has a party out of the game`);
    if (loanOwed(s, loan) <= 0) errors.push(`loan ${loan.id} is paid off but still listed`);
    for (const space of loan.collateral) {
      const ps = s.properties[space];
      if (!ps || ps.owner !== loan.borrower || ps.mortgaged) errors.push(`loan ${loan.id} collateral ${space} is not the borrower's, unmortgaged`);
      if (pledged.has(space)) errors.push(`space ${space} backs two loans`);
      pledged.add(space);
    }
  }
  if (s.flow.loan !== null && s.flow.trade !== null) errors.push('a trade and a loan on the table at once');
  // Myanmar map: the general (D107).
  const general = s.economy.general;
  if (general !== null) {
    const g = s.players[general];
    if (!RULES.general || !g || g.bankrupt || g.rank < MYANMAR.generalMinRank) errors.push(`general ${general} is not a living player of rank 4 or more`);
    else if (s.players.some((p) => !p.bankrupt && p.rank > g.rank)) errors.push('someone outranks the general');
  } else if (s.players.some((p) => !p.bankrupt && p.rank >= MYANMAR.generalMinRank)) {
    errors.push('a player of rank 4 or more but no general');
  }
  if (!RULES.pot && s.economy.pot !== 0) errors.push('a pot on a map without one');
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
      ...s.players
        .flatMap((p) => [...p.jailCards, ...p.houseVouchers])
        .filter((id) => id.startsWith(`${deck}-`) || id.startsWith(`mm-${deck}-`)),
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
