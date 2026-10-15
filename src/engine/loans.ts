// Loans between players on the Myanmar map (owner's spec 7.11, D104). A loan is asked for and
// negotiated like a trade offer (D99): one offer on the table at a time, answered with accept,
// reject or new terms. Interest is simple and is worked out from the rounds passed, never stored.
import { MYANMAR, roundMoney } from '../data/balance.js';
import { CITY_BY_SPACE, COUNTRY_CITIES, propertyName, propertyPrice, RULES } from '../data/board.js';
import { countryOf, emit, livingPlayers, makeError, transfer, type Ctx } from './core.js';
import type { EngineError, GameState, Loan, LoanOffer } from './types.js';

/** What the borrower owes now: the amount lent plus simple interest, at most three times it, less what was paid. */
export function loanOwed(s: GameState, loan: Loan): number {
  const rounds = Math.max(0, s.turn.roundNumber - loan.startRound);
  const grown = Math.min(loan.principal * (1 + (loan.ratePercent / 100) * rounds), loan.principal * MYANMAR.loanMaxMultiple);
  return Math.max(0, roundMoney(grown) - loan.repaid);
}

/** Rounds left before the loan must be paid back (0: it falls due at the next round start). */
export function loanRoundsLeft(s: GameState, loan: Loan): number {
  return Math.max(0, loan.startRound + loan.term - s.turn.roundNumber);
}

/** Every property pledged for a loan. */
export function pledgedSpaces(s: GameState): Set<number> {
  return new Set(s.economy.loans.flatMap((l) => l.collateral));
}

export function isPledged(s: GameState, space: number): boolean {
  return s.economy.loans.some((l) => l.collateral.includes(space));
}

/** A city whose region has a pledged city cannot take a building (it would break the even rule). */
export function regionPledged(s: GameState, space: number): number | null {
  const country = countryOf(space);
  if (country === null) return isPledged(s, space) ? space : null;
  return COUNTRY_CITIES[country].find((sp) => isPledged(s, sp)) ?? null;
}

/** Nobody is negotiating and the game is between decisions (like trading, D99). */
export function loanTableFree(s: GameState): boolean {
  return s.flow.trade === null && s.flow.loan === null;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Why this loan offer cannot be made (or accepted) now, or null. */
export function loanOfferBlocker(s: GameState, offer: LoanOffer): EngineError | null {
  if (!offer || typeof offer !== 'object') return makeError('invalidAction');
  const { lender, borrower } = offer;
  const lenderP = isInt(lender) ? s.players[lender] : undefined;
  const borrowerP = isInt(borrower) ? s.players[borrower] : undefined;
  if (!lenderP || !borrowerP || lender === borrower || lenderP.bankrupt || borrowerP.bankrupt) return makeError('tradeInvalidPlayer');
  const parties = [offer.from, offer.to].sort().join();
  if (parties !== [lender, borrower].sort().join()) return makeError('invalidAction');
  if (!isInt(offer.amount) || offer.amount < 1) return makeError('loanTerms');
  if (!isInt(offer.ratePercent) || offer.ratePercent < 0 || offer.ratePercent > MYANMAR.loanMaxRatePercent) return makeError('loanTerms');
  if (!isInt(offer.term) || offer.term < 1 || offer.term > MYANMAR.loanMaxTerm) return makeError('loanTerms');
  if (!Array.isArray(offer.collateral) || offer.collateral.length === 0) return makeError('loanCollateral');
  if (new Set(offer.collateral).size !== offer.collateral.length) return makeError('loanCollateral');
  for (const space of offer.collateral) {
    const ps = isInt(space) ? s.properties[space] : undefined;
    const name = isInt(space) && s.properties[space] ? propertyName(space) : '';
    if (!ps || ps.owner !== borrower || ps.mortgaged) return makeError('loanCollateral', { name });
    if (isPledged(s, space)) return makeError('pledged', { name });
    const country = CITY_BY_SPACE.has(space) ? countryOf(space) : null;
    if (country !== null && COUNTRY_CITIES[country].some((sp) => (s.properties[sp]?.level ?? 0) > 0)) {
      return makeError('loanCollateral', { name });
    }
  }
  return null;
}

/** The loan on the table is accepted: the lender pays, and the loan starts this round. */
export function acceptLoan(c: Ctx, offer: LoanOffer): void {
  const s = c.s;
  s.economy.loanSeq += 1;
  const loan: Loan = {
    id: s.economy.loanSeq,
    lender: offer.lender,
    borrower: offer.borrower,
    principal: offer.amount,
    ratePercent: offer.ratePercent,
    term: offer.term,
    startRound: s.turn.roundNumber,
    collateral: [...offer.collateral],
    repaid: 0,
  };
  s.economy.loans.push(loan);
  transfer(c, loan.lender, loan.borrower, loan.principal, 'loan');
  emit(c, { type: 'loanAccepted', loan: { ...loan, collateral: [...loan.collateral] } });
}

/** The borrower pays back `amount` (the caller checked it); a loan paid off ends. */
export function repayLoan(c: Ctx, loanId: number, amount: number, auto: boolean): void {
  const s = c.s;
  const loan = s.economy.loans.find((l) => l.id === loanId);
  if (!loan || amount <= 0) return;
  transfer(c, loan.borrower, loan.lender, amount, 'loan');
  loan.repaid += amount;
  const left = loanOwed(s, loan);
  if (left <= 0) s.economy.loans = s.economy.loans.filter((l) => l.id !== loanId);
  emit(c, { type: 'loanRepaid', loanId, borrower: loan.borrower, lender: loan.lender, amount, left, auto });
}

/** Passing Start takes a quarter of each debt, when the cash is there (never as a debt). */
export function startRepayments(c: Ctx, playerId: number): void {
  if (!RULES.loans) return;
  const s = c.s;
  for (const loan of [...s.economy.loans]) {
    if (loan.borrower !== playerId) continue;
    const owed = loanOwed(s, loan);
    const amount = Math.min(owed, roundMoney((owed * MYANMAR.loanStartRepayPercent) / 100));
    const cash = s.players[playerId]?.cash ?? 0;
    if (amount > 0 && cash >= amount) repayLoan(c, loan.id, amount, true);
  }
}

/** At a round start, a loan past its term and still owed hands its collateral to the lender. */
export function defaultLoans(c: Ctx): void {
  if (!RULES.loans) return;
  const s = c.s;
  for (const loan of [...s.economy.loans]) {
    const owed = loanOwed(s, loan);
    if (loanRoundsLeft(s, loan) > 0 || owed <= 0) continue;
    // The debt falls due (D108): it is paid from the borrower's cash, with its interest. Only when
    // the cash does not cover it does the lender take the collateral as well, for what is missing.
    const cash = s.players[loan.borrower]?.cash ?? 0;
    const paid = Math.min(owed, Math.max(0, cash));
    if (paid > 0) {
      transfer(c, loan.borrower, loan.lender, paid, 'loan');
      loan.repaid += paid;
    }
    const left = owed - paid;
    emit(c, { type: 'loanDue', loanId: loan.id, borrower: loan.borrower, lender: loan.lender, owed, paid, left });
    if (left <= 0) s.economy.loans = s.economy.loans.filter((l) => l.id !== loan.id);
    else seizeCollateral(c, loan, 'term');
  }
}

function seizeCollateral(c: Ctx, loan: Loan, why: 'term' | 'bankruptcy'): void {
  const s = c.s;
  for (const space of loan.collateral) {
    const ps = s.properties[space];
    if (ps && ps.owner === loan.borrower) ps.owner = loan.lender;
  }
  s.economy.loans = s.economy.loans.filter((l) => l.id !== loan.id);
  emit(c, { type: 'loanDefaulted', loanId: loan.id, borrower: loan.borrower, lender: loan.lender, collateral: [...loan.collateral], why });
}

/**
 * A player goes bankrupt (called before their properties are handed on): as borrower, each lender
 * takes their collateral first, before any other creditor or the bank; as lender, their loans end
 * and the collateral is freed. A loan offer they are part of is cancelled.
 */
export function bankruptLoans(c: Ctx, playerId: number): void {
  const s = c.s;
  const offer = s.flow.loan;
  if (offer && (offer.from === playerId || offer.to === playerId)) {
    s.flow.loan = null;
    emit(c, { type: 'loanCancelled', from: offer.from, to: offer.to });
  }
  for (const loan of [...s.economy.loans]) {
    if (loan.borrower === playerId && !(s.players[loan.lender]?.bankrupt ?? true)) seizeCollateral(c, loan, 'bankruptcy');
    else if (loan.borrower === playerId || loan.lender === playerId) {
      s.economy.loans = s.economy.loans.filter((l) => l.id !== loan.id);
      emit(c, { type: 'loanForgiven', loanId: loan.id, borrower: loan.borrower, lender: loan.lender });
    }
  }
}

/** Loans in net worth: what a player is owed, less what they owe. */
export function loanBalance(s: GameState, playerId: number): number {
  let total = 0;
  for (const loan of s.economy.loans) {
    if (loan.lender === playerId) total += loanOwed(s, loan);
    if (loan.borrower === playerId) total -= loanOwed(s, loan);
  }
  return total;
}

/** The collateral's printed value (for the bots and the panel). */
export function collateralValue(spaces: readonly number[]): number {
  return spaces.reduce((sum, sp) => sum + propertyPrice(sp), 0);
}

/** True while both parties are still in (for the invariants). */
export function loanPartiesAlive(s: GameState, loan: Loan): boolean {
  return livingPlayers(s).some((p) => p.id === loan.lender) && livingPlayers(s).some((p) => p.id === loan.borrower);
}

