// The general on the Myanmar map (owner's spec v2, D107): the status line (who is general, unrest
// so far, when the power is next ready), the general's choice of property after a land roll (the
// power always hits the richest player, D115), the unrest window everyone answers within 20
// seconds, the bribe offer and its answer.
import { Megaphone, Medal, ShieldBan, Swords } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MYANMAR } from '../../data/balance';
import {
  generalOn,
  legalActions,
  legalActionsFor,
  powerAmount,
  validateAction,
  type Action,
  type GameState,
  type Player,
} from '../../engine';
import { Button } from '../components/Button';
import { TokenChip } from '../components/glyphs';
import { Sheet } from '../overlays/Overlays';
import { canAct, closeSheet, dispatch } from '../store';
import { money, T } from '../strings';
import { spaceName } from '../view';
import { Panel } from './Panel';

/** Cups that bring the general down (3, or fewer with two players: D107). */
function needed(s: GameState): number {
  const others = s.players.filter((p) => !p.bankrupt && p.id !== s.economy.general).length;
  return Math.min(MYANMAR.unrestToDepose, others * MYANMAR.unrestCups);
}

/** Rounds until the general's power is ready again (0: ready). */
export function powerWait(s: GameState): number {
  const last = s.economy.powerRound;
  return last === null ? 0 : Math.max(0, last + MYANMAR.powerEveryRounds - s.turn.roundNumber);
}

/** Who is general, the unrest shown against them, and when their power is next ready. */
export function GeneralLine({ s }: { s: GameState }) {
  if (!generalOn(s)) return null;
  const g = s.economy.general !== null ? s.players[s.economy.general] : undefined;
  return (
    <p className="general-line">
      <Medal size={15} aria-hidden="true" />
      {g ? (
        <>
          <span className="general-who">{T.general.who(g.name, g.rank)}</span>
          <span className="general-meta">{T.general.unrest(s.economy.unrestUsed, needed(s))}</span>
          <span className="general-meta">{powerWait(s) === 0 ? T.general.ready : T.general.wait(powerWait(s))}</span>
        </>
      ) : (
        <span>{T.general.none}</span>
      )}
    </p>
  );
}

/** After a land roll the general picks which property of the richest player (D115). */
export function PowerTargetPanel({ s }: { s: GameState }) {
  const pending = s.flow.pending;
  if (pending?.kind !== 'powerTarget') return null;
  const general = s.players[s.turn.currentPlayerIndex] as Player;
  const options = legalActions(s).filter((a): a is Extract<Action, { type: 'powerTarget' }> => a.type === 'powerTarget');
  const total = pending.dice[0] + pending.dice[1];
  return (
    <Panel id="power-target" icon={Swords} title={T.general.targetTitle} whose={general} help="general" tone="warn">
      <p className="fact-strong">{T.general.rolled(total, pending.outcome)}</p>
      <p className="field-label">
        {pending.outcome === 'money' || options[0] === undefined
          ? T.general.pickPlayer
          : T.general.pickLand((s.players[options[0].player] as Player).name)}
      </p>
      <ul className="power-options">
        {options.map((a) => {
          const p = s.players[a.player] as Player;
          return (
            <li key={`${a.player}-${a.space ?? 'cash'}`}>
              <Button
                id={`power-target-${a.player}${a.space === null ? '' : `-${a.space}`}`}
                label={
                  <span className="power-option">
                    <TokenChip token={p.token} color={p.color} size={18} />
                    {a.space === null ? `${p.name} · ${money(p.cash)}` : `${spaceName(s, a.space)} · ${p.name}`}
                  </span>
                }
                action={a}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const WINDOW_SECONDS = 20;

/**
 * The unrest window. Every player in it answers on their own device (one shared device: all here);
 * when 20 seconds run out, this device holds back for its players who have not answered. Answers so
 * far are shown to everyone.
 */
export function UnrestPanel({ s }: { s: GameState }) {
  const pending = s.flow.pending;
  const windowId = s.meta.logSeq;
  const [left, setLeft] = useState(WINDOW_SECONDS);
  const started = useRef<{ id: number; at: number } | null>(null);
  useEffect(() => {
    if (pending?.kind !== 'unrest') return;
    // The countdown restarts only for a new window, not for each answer in it.
    const id = s.meta.log.findLast((e) => e.event.type === 'powerTargeted')?.seq ?? windowId;
    if (started.current?.id !== id) started.current = { id, at: Date.now() };
    const tick = () => {
      const passed = Math.floor((Date.now() - (started.current?.at ?? Date.now())) / 1000);
      setLeft(Math.max(0, WINDOW_SECONDS - passed));
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [pending?.kind, windowId, s.meta.log]);
  useEffect(() => {
    if (left > 0 || pending?.kind !== 'unrest') return;
    // Time is up: hold back for this device's players who have not answered.
    const mine = pending.waiting.filter((id) => canAct(id));
    if (mine[0] !== undefined) dispatch({ type: 'unrestAnswer', player: mine[0], use: false, block: false });
  }, [left, pending]);
  if (pending?.kind !== 'unrest') return null;
  const general = s.players[s.turn.currentPlayerIndex] as Player;
  const target = s.players[pending.target] as Player;
  const answered = s.meta.log
    .slice(s.meta.log.findLastIndex((e) => e.event.type === 'powerTargeted') + 1)
    .map((e) => e.event)
    .filter((e): e is Extract<GameState['meta']['log'][number]['event'], { type: 'unrestAnswered' }> => e.type === 'unrestAnswered');
  return (
    <Panel id="unrest" icon={Megaphone} title={T.general.windowTitle(general.name)} help="general" tone="warn" className="unrest-panel">
      <p className="fact-strong">
        {pending.outcome === 'money' || pending.space === null
          ? T.general.windowMoney(target.name, powerAmount(s, target.id))
          : T.general.windowLand(target.name, spaceName(s, pending.space))}
      </p>
      <p className="muted small">{T.general.windowHint(needed(s))}</p>
      <p className="unrest-tally" aria-live="polite">
        <span className="unrest-count">{T.general.unrest(s.economy.unrestUsed, needed(s))}</span>
        <span className="unrest-clock">{T.general.countdown(left)}</span>
      </p>
      <ul className="unrest-rows">
        {answered.map((e) => {
          const p = s.players[e.player] as Player;
          return (
            <li key={`a-${e.player}`} className={`unrest-row ${e.use ? 'is-used' : ''}`}>
              <TokenChip token={p.token} color={p.color} size={18} />
              <span>{T.general.answered(p.name, e.use, e.block)}</span>
            </li>
          );
        })}
        {pending.waiting.map((id) => {
          const p = s.players[id] as Player;
          const answers = legalActionsFor(s, id).filter(
            (a): a is Extract<Action, { type: 'unrestAnswer' }> => a.type === 'unrestAnswer' && a.player === id,
          );
          const here = canAct(id);
          return (
            <li key={`w-${id}`} className="unrest-row is-waiting">
              <TokenChip token={p.token} color={p.color} size={18} />
              <span className="unrest-name">
                {p.name} · {T.general.cups(p.unrest)}
              </span>
              {here ? (
                <span className="inline-actions">
                  {answers.some((a) => a.use) && (
                    <Button id={`unrest-show-${id}`} label={T.general.show} icon={<Megaphone size={16} aria-hidden="true" />} action={{ type: 'unrestAnswer', player: id, use: true, block: false }} />
                  )}
                  {answers.some((a) => a.block) && (
                    <Button
                      id={`unrest-block-${id}`}
                      label={T.general.block(MYANMAR.powerBlockMerit)}
                      icon={<ShieldBan size={16} aria-hidden="true" />}
                      action={{ type: 'unrestAnswer', player: id, use: false, block: true }}
                    />
                  )}
                  <Button id={`unrest-hold-${id}`} label={T.general.hold} action={{ type: 'unrestAnswer', player: id, use: false, block: false }} />
                </span>
              ) : (
                <span className="muted small">{T.general.waiting(p.name)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** A bribe on the table: the player it is offered to takes it or turns it down. */
export function BribePanel({ s }: { s: GameState }) {
  const pending = s.flow.pending;
  if (pending?.kind !== 'bribe') return null;
  const general = s.players[s.turn.currentPlayerIndex] as Player;
  const to = s.players[pending.to] as Player;
  return (
    <Panel
      id="bribe"
      icon={Medal}
      title={T.general.bribeOffer(general.name, to.name, pending.amount)}
      whose={to}
      help="general"
      tone="neutral"
      actions={
        <span className="inline-actions">
          <Button id="bribe-accept" variant="primary" label={T.general.bribeAccept} action={{ type: 'respondBribe', accept: true }} />
          <Button id="bribe-reject" label={T.general.bribeReject} action={{ type: 'respondBribe', accept: false }} />
        </span>
      }
    >
      <p className="fact-big money">{money(pending.amount)}</p>
      <p className="muted small">{T.general.bribeHint}</p>
    </Panel>
  );
}

/** The general's sheet to offer a bribe: to whom and how much. */
export function BribeSheet({ s }: { s: GameState }) {
  const candidates = s.players.filter((p) => validateAction(s, { type: 'offerBribe', to: p.id, amount: 1 }) === null);
  const [to, setTo] = useState<number>(candidates[0]?.id ?? -1);
  const [amount, setAmount] = useState('300');
  const sent = useRef(false);
  const action: Action = { type: 'offerBribe', to, amount: Math.round(Number(amount)) || 0 };
  const problem = validateAction(s, action)?.reason ?? null;
  useEffect(() => {
    if (sent.current && s.flow.pending?.kind === 'bribe') closeSheet();
  }, [s.flow.pending]);
  return (
    <Sheet
      id="bribe"
      title={
        <span className="sheet-title-row">
          <Medal size={22} aria-hidden="true" />
          {T.general.bribeTitle}
        </span>
      }
      onClose={closeSheet}
      help="general"
      footer={
        <>
          <Button id="bribe-cancel" label={T.loan.cancel} onClick={closeSheet} />
          <Button
            id="bribe-send"
            variant="primary"
            label={T.general.bribeSend}
            reason={problem}
            showReason
            onClick={() => {
              sent.current = true;
              dispatch(action, 'bribe-send');
            }}
          />
        </>
      }
    >
      <fieldset className="field">
        <legend className="field-label">{T.general.bribeTo}</legend>
        <div className="segmented" role="radiogroup" aria-label={T.general.bribeTo}>
          {candidates.map((p) => (
            <label key={p.id} className={`segment ${p.id === to ? 'is-on' : ''}`}>
              <input type="radio" name="bribe-to" checked={p.id === to} onChange={() => setTo(p.id)} />
              <TokenChip token={p.token} color={p.color} size={18} />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="loan-field">
        <span className="field-label">{T.general.bribeAmount}</span>
        <input id="bribe-amount" className="text-input" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <p className="field-hint">{T.general.bribeHint}</p>
    </Sheet>
  );
}
