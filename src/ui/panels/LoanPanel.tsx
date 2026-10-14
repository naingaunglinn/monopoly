// Loans on the Myanmar map (owner's spec 7.11, D104): the request on the table as a promissory
// note everyone sees (accept, new terms or reject; the borrower may withdraw), the sheet that asks
// for a loan or sends new terms, and the list of loans with their debt now. The engine decides what
// is allowed; amounts owed and rounds left come from it too.
import { Check, HandCoins, Link2, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MYANMAR } from '../../data/balance';
import {
  legalActions,
  loanOwed,
  loanRoundsLeft,
  validateAction,
  type Action,
  type GameState,
  type LoanOffer,
  type Player,
} from '../../engine';
import { Button } from '../components/Button';
import { TokenChip } from '../components/glyphs';
import { inkOnPaper } from '../contrast';
import { Sheet } from '../overlays/Overlays';
import { useOnline } from '../session/online';
import { canAct, closeSheet, dispatch, openSheet } from '../store';
import { money, T } from '../strings';
import { defaultTrader, tradersHere } from '../trading';
import { spaceName } from '../view';
import { Panel } from './Panel';

/** How many sets of new terms followed the request on the table. */
function loanRound(s: GameState): number {
  let round = 0;
  for (let i = s.meta.log.length - 1; i >= 0; i--) {
    const type = s.meta.log[i]?.event.type;
    if (type === 'loanCountered') round++;
    else if (type === 'loanRequested') return round;
  }
  return round;
}

function Who({ p }: { p: Player }) {
  return (
    <span className="loan-who" style={{ ['--player' as string]: p.color }}>
      <TokenChip token={p.token} color={p.color} size={18} />
      {p.name}
    </span>
  );
}

/** The terms as a note: who lends whom, how much, the rate, the term and the collateral. */
function LoanNote({ s, offer }: { s: GameState; offer: LoanOffer }) {
  const lender = s.players[offer.lender] as Player;
  const borrower = s.players[offer.borrower] as Player;
  return (
    <div className="loan-note">
      <p className="loan-parties">
        <Who p={lender} />
        <HandCoins size={18} aria-hidden="true" />
        <Who p={borrower} />
      </p>
      <p className="loan-amount money">{money(offer.amount)}</p>
      <p className="loan-terms">{T.loan.terms(offer.ratePercent, offer.term)}</p>
      <p className="muted small">{T.loan.cap(offer.amount * MYANMAR.loanMaxMultiple)}</p>
      <p className="field-label loan-collateral-label">{T.loan.collateral}</p>
      <ul className="loan-collateral">
        {offer.collateral.map((space) => (
          <li key={space}>
            <Link2 size={14} aria-hidden="true" />
            {spaceName(s, space)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LoanPanel({ s }: { s: GameState }) {
  const online = useOnline();
  const offer = s.flow.loan;
  if (!offer) return null;
  const from = s.players[offer.from] as Player;
  const to = s.players[offer.to] as Player;
  const round = loanRound(s);
  const title =
    round === 0
      ? T.loan.request((s.players[offer.borrower] as Player).name, (s.players[offer.lender] as Player).name)
      : T.loan.counterBetween(from.name, to.name);
  const withdraw = <Button id="loan-withdraw" label={T.loan.withdraw} icon={<Undo2 size={16} aria-hidden="true" />} action={{ type: 'withdrawLoan' }} />;
  const acceptReason = validateAction(s, { type: 'respondLoan', accept: true })?.reason ?? null;
  return (
    <Panel
      id="loan"
      icon={HandCoins}
      title={title}
      whose={to}
      help="loans"
      className="loan-panel"
      actions={
        <span className="inline-actions">
          <Button
            id="loan-accept"
            variant="primary"
            label={T.loan.accept}
            icon={<Check size={18} aria-hidden="true" />}
            reason={acceptReason}
            showReason
            action={{ type: 'respondLoan', accept: true }}
          />
          {legalActions(s).some((a) => a.type === 'counterLoan') && (
            <Button id="loan-counter" label={T.loan.counter} onClick={() => openLoanSheet(true)} />
          )}
          <Button id="loan-reject" label={T.loan.reject} icon={<X size={18} aria-hidden="true" />} action={{ type: 'respondLoan', accept: false }} />
        </span>
      }
      waitingActions={online && canAct(from.id) ? withdraw : null}
    >
      <div className="loan-note-wrap">
        <div className="loan-note-frame">
          {round > 0 && (
            <span key={`stamp-${round}`} className="slip-stamp" style={{ ['--stamp-ink' as string]: inkOnPaper(from.color) }}>
              {T.loan.stamp(round)}
            </span>
          )}
          <LoanNote s={s} offer={offer} />
        </div>
      </div>
    </Panel>
  );
}

/** Opens the loan sheet: a new request, or new terms for the request on the table. */
export function openLoanSheet(counter = false): void {
  openSheet({ kind: 'loan', counter });
}

/** The borrower's properties that could be pledged, with the engine's reason when one cannot. */
function pledgeable(s: GameState, offer: LoanOffer): Array<{ space: number; reason: string | null }> {
  const out: Array<{ space: number; reason: string | null }> = [];
  s.properties.forEach((ps, space) => {
    if (!ps || ps.owner !== offer.borrower) return;
    const reason = validateAction(s, { type: 'requestLoan', offer: { ...offer, from: offer.borrower, collateral: [space] } })?.reason ?? null;
    out.push({ space, reason: reason && /collateral|pledged/i.test(reason) ? reason : null });
  });
  return out;
}

const whole = (text: string, min: number, max: number): number => {
  const n = Math.round(Number(text));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

export function LoanBuilder({ s, counter = false }: { s: GameState; counter?: boolean }) {
  const table = s.flow.loan;
  const borrowers = tradersHere(s);
  const [borrowerId, setBorrowerId] = useState<number | null>(() => (counter ? (table?.borrower ?? null) : defaultTrader(s, borrowers)));
  const lenders = s.players.filter((p) => !p.bankrupt && p.id !== borrowerId);
  const [lenderId, setLenderId] = useState<number>(() => (counter ? (table?.lender ?? -1) : (lenders[0]?.id ?? -1)));
  const [amount, setAmount] = useState(String(counter && table ? table.amount : 500));
  const [rate, setRate] = useState(String(counter && table ? table.ratePercent : 5));
  const [term, setTerm] = useState(String(counter && table ? table.term : 5));
  const [collateral, setCollateral] = useState<number[]>(() => (counter && table ? [...table.collateral] : []));
  const sent = useRef(false);
  const borrower = borrowerId !== null ? (s.players[borrowerId] ?? null) : null;
  const lender = s.players[lenderId] ?? null;
  const offer: LoanOffer | null =
    borrower && lender
      ? {
          from: counter && table ? table.to : borrower.id,
          to: counter && table ? table.from : lender.id,
          lender: lender.id,
          borrower: borrower.id,
          amount: whole(amount, 0, 1_000_000),
          ratePercent: whole(rate, 0, 100),
          term: whole(term, 0, 1000),
          collateral,
        }
      : null;
  const action: Action | null = offer ? (counter ? { type: 'counterLoan', offer } : { type: 'requestLoan', offer }) : null;
  const problem = action ? (validateAction(s, action)?.reason ?? null) : T.trade.pickPartner;
  useEffect(() => {
    // Close once the request is on the table, or when the request being answered is gone.
    if (counter && !table) closeSheet();
    else if (sent.current && table) closeSheet();
  }, [counter, table]);
  if (!borrower) return null;
  const options = offer ? pledgeable(s, offer) : [];
  return (
    <Sheet
      id="loan"
      title={
        <span className="sheet-title-row">
          <HandCoins size={22} aria-hidden="true" />
          {counter && table ? T.loan.counterTitle((s.players[table.from] as Player).name) : T.loan.title}
        </span>
      }
      onClose={closeSheet}
      help="loans"
      footer={
        <>
          <Button id="loan-cancel" label={T.loan.cancel} onClick={closeSheet} />
          <Button
            id="loan-send"
            variant="primary"
            label={counter ? T.loan.sendCounter : T.loan.send}
            reason={problem}
            showReason
            onClick={() => {
              if (!action) return;
              sent.current = true;
              dispatch(action, 'loan-send');
            }}
          />
        </>
      }
    >
      {!counter && borrowers.length > 1 && (
        <fieldset className="field">
          <legend className="field-label">{T.loan.borrower}</legend>
          <div className="segmented" role="radiogroup" aria-label={T.loan.borrower}>
            {borrowers.map((id) => {
              const p = s.players[id] as Player;
              return (
                <label key={id} className={`segment ${id === borrowerId ? 'is-on' : ''}`}>
                  <input
                    type="radio"
                    name="borrower"
                    checked={id === borrowerId}
                    onChange={() => {
                      setBorrowerId(id);
                      setCollateral([]);
                      if (id === lenderId) setLenderId(s.players.find((q) => !q.bankrupt && q.id !== id)?.id ?? -1);
                    }}
                  />
                  <TokenChip token={p.token} color={p.color} size={18} />
                  <span>{p.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {!counter && (
        <fieldset className="field">
          <legend className="field-label">{T.loan.lender}</legend>
          <div className="segmented" role="radiogroup" aria-label={T.loan.lender}>
            {lenders.map((p) => (
              <label key={p.id} className={`segment ${p.id === lenderId ? 'is-on' : ''}`}>
                <input type="radio" name="lender" checked={p.id === lenderId} onChange={() => setLenderId(p.id)} />
                <TokenChip token={p.token} color={p.color} size={18} />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="loan-fields">
        <label className="loan-field">
          <span className="field-label">{T.loan.amount}</span>
          <input id="loan-amount" className="text-input" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="loan-field">
          <span className="field-label">{T.loan.rate}</span>
          <input
            id="loan-rate"
            className="text-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={MYANMAR.loanMaxRatePercent}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
        <label className="loan-field">
          <span className="field-label">{T.loan.term}</span>
          <input id="loan-term" className="text-input" type="number" inputMode="numeric" min={1} max={MYANMAR.loanMaxTerm} value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
      </div>
      <fieldset className="field">
        <legend className="field-label">{T.loan.collateral}</legend>
        <p className="field-hint">{T.loan.collateralHint}</p>
        {options.every((o) => o.reason !== null) && <p className="muted small">{T.loan.noCollateral}</p>}
        <ul className="loan-pick">
          {options.map(({ space, reason }) => (
            <li key={space}>
              <label className={`loan-pick-row ${reason ? 'is-blocked' : ''}`} title={reason ?? undefined}>
                <input
                  type="checkbox"
                  disabled={reason !== null && !collateral.includes(space)}
                  checked={collateral.includes(space)}
                  onChange={() => setCollateral(collateral.includes(space) ? collateral.filter((x) => x !== space) : [...collateral, space])}
                />
                <span>{spaceName(s, space)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </Sheet>
  );
}

/** The loans a player is part of (or all of them), with the debt now and, for the borrower, Pay back. */
export function LoansList({ s, player = null }: { s: GameState; player?: number | null }) {
  const loans = s.economy.loans.filter((l) => player === null || l.lender === player || l.borrower === player);
  if (loans.length === 0) return null;
  const legal = legalActions(s);
  return (
    <section className="loans-list" aria-label={T.loan.listTitle}>
      <h3 className="prop-group-title">{T.loan.listTitle}</h3>
      <ul>
        {loans.map((loan) => {
          const borrower = s.players[loan.borrower] as Player;
          const lender = s.players[loan.lender] as Player;
          const repay = legal.find((a): a is Extract<Action, { type: 'repayLoan' }> => a.type === 'repayLoan' && a.loanId === loan.id);
          return (
            <li key={loan.id} className="loan-row">
              <span className="loan-row-who">{T.loan.owes(borrower.name, lender.name)}</span>
              <span className="loan-row-owed money">
                {T.loan.owedNow} {money(loanOwed(s, loan))}
              </span>
              <span className="muted small">
                {T.loan.terms(loan.ratePercent, loan.term)} · {T.loan.roundsLeft(loanRoundsLeft(s, loan))}
              </span>
              <span className="muted small">
                <Link2 size={13} aria-hidden="true" /> {loan.collateral.map((sp) => spaceName(s, sp)).join(', ')}
              </span>
              {repay && canAct(loan.borrower) && (
                <Button id={`loan-repay-${loan.id}`} label={T.loan.payBack(repay.amount)} action={repay} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
