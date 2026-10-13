// The offer on the table (spec 7.2, D99), shown to every player: an exchange slip with what each
// side gives, facing each other across a perforation. A counter-offer wears a rubber stamp with its
// round, and items that changed since the previous offer are marked, so everyone can follow the
// talks. The partner accepts, counters or rejects; the player who made the offer can withdraw it.
import { ArrowLeftRight, Check, Undo2, X } from 'lucide-react';
import type { GameState, Player, TradeOffer, TradeSide } from '../../engine';
import { Button } from '../components/Button';
import { Flag } from '../components/Flag';
import { TokenChip } from '../components/glyphs';
import { inkOnPaper } from '../contrast';
import { useOnline } from '../session/online';
import { askConfirm, canAct, openSheet } from '../store';
import { money, T } from '../strings';
import { negotiation, sideOf } from '../trading';
import { countryOfSpace, spaceName } from '../view';
import { Panel } from './Panel';

/** The previous offer of the same negotiation, remembered across re-renders and remounts. */
let remembered: { negotiation: number; key: string; offer: TradeOffer; prev: TradeOffer | null } | null = null;

function previousOffer(negotiationId: number, offer: TradeOffer): TradeOffer | null {
  const key = JSON.stringify(offer);
  if (!remembered || remembered.negotiation !== negotiationId) {
    remembered = { negotiation: negotiationId, key, offer, prev: null };
  } else if (remembered.key !== key) {
    remembered = { negotiation: negotiationId, key, offer, prev: remembered.offer };
  }
  return remembered.prev;
}

function SlipSide({
  s,
  player,
  side,
  before,
  label,
}: {
  s: GameState;
  player: Player;
  side: TradeSide;
  /** The same player's side in the previous offer, to mark what changed. */
  before: TradeSide | null;
  label: string;
}) {
  const dropped = before ? before.properties.filter((sp) => !side.properties.includes(sp)) : [];
  const empty = side.properties.length === 0 && side.cash === 0 && side.jailCards === 0 && dropped.length === 0;
  const cashChanged = before !== null && before.cash !== side.cash;
  const cardsChanged = before !== null && before.jailCards !== side.jailCards;
  return (
    <section className="slip-side" style={{ ['--player' as string]: player.color }} aria-label={label}>
      <h3 className="slip-who">
        <TokenChip token={player.token} color={player.color} size={22} />
        <span>{label}</span>
      </h3>
      {empty && <p className="slip-nothing">{T.trade.nothing}</p>}
      <ul className="slip-items">
        {side.properties.map((space) => {
          const country = countryOfSpace(space);
          const isNew = before !== null && !before.properties.includes(space);
          return (
            <li key={space} className={`slip-item ${isNew ? 'is-new' : ''}`}>
              {country ? <Flag code={country.flag} width={16} /> : <span className="slip-dot" aria-hidden="true" />}
              <span className="slip-name">{spaceName(s, space)}</span>
              {s.properties[space]?.mortgaged && <span className="badge badge-warn">{T.focus.mortgaged}</span>}
              {isNew && <span className="slip-mark">{T.trade.isNew}</span>}
            </li>
          );
        })}
        {dropped.map((space) => (
          <li key={`out-${space}`} className="slip-item is-dropped">
            <span className="slip-dot" aria-hidden="true" />
            <span className="slip-name">{spaceName(s, space)}</span>
            <span className="slip-mark is-out">{T.trade.dropped}</span>
          </li>
        ))}
        {(side.cash > 0 || cashChanged) && (
          <li className={`slip-item slip-cash ${cashChanged ? 'is-new' : ''}`}>
            <span className="slip-amount money">{money(side.cash)}</span>
            {cashChanged && before && <span className="slip-was">{T.trade.was(money(before.cash))}</span>}
          </li>
        )}
        {(side.jailCards > 0 || cardsChanged) && (
          <li className={`slip-item ${cardsChanged ? 'is-new' : ''}`}>
            <span className="slip-name">
              {side.jailCards} × {T.players.jailCard}
            </span>
            {cardsChanged && before && <span className="slip-was">{T.trade.was(String(before.jailCards))}</span>}
          </li>
        )}
      </ul>
    </section>
  );
}

export function TradePanel({ s }: { s: GameState }) {
  const online = useOnline();
  const offer = s.flow.trade;
  if (!offer) return null;
  const from = s.players[offer.from] as Player;
  const to = s.players[offer.to] as Player;
  const { id, round } = negotiation(s);
  const prev = previousOffer(id, offer);
  // "You" is this device's own party; on one shared device, the player holding it to answer.
  const youTo = online ? canAct(to.id) : true;
  const youFrom = online ? canAct(from.id) && !youTo : false;
  const title =
    round === 0
      ? youTo
        ? T.trade.offerFrom(from.name)
        : youFrom
          ? T.trade.offerTo(to.name)
          : T.trade.offerBetween(from.name, to.name)
      : youTo
        ? T.trade.counterFrom(from.name)
        : youFrom
          ? T.trade.counterTo(to.name)
          : T.trade.counterBetween(from.name, to.name);
  const label = (p: Player, you: boolean) => (you ? T.trade.youGiveBack : T.trade.theyGive(p.name));
  const withdraw = (
    <Button
      id="trade-withdraw"
      label={T.trade.withdraw}
      icon={<Undo2 size={16} aria-hidden="true" />}
      action={{ type: 'withdrawTrade' }}
    />
  );
  return (
    <Panel
      id="trade"
      icon={ArrowLeftRight}
      title={title}
      whose={to}
      help="trading"
      className="trade-panel"
      actions={
        <span className="inline-actions">
          <Button
            id="trade-accept"
            variant="primary"
            label={T.trade.accept}
            icon={<Check size={18} aria-hidden="true" />}
            onClick={() => askConfirm({ kind: 'acceptTrade' })}
          />
          <Button
            id="trade-counter"
            label={T.trade.counter}
            icon={<ArrowLeftRight size={16} aria-hidden="true" />}
            onClick={() => openSheet({ kind: 'trade', counter: true })}
          />
          <Button id="trade-reject" label={T.trade.reject} icon={<X size={18} aria-hidden="true" />} action={{ type: 'respondTrade', accept: false }} />
        </span>
      }
      // On one shared device the player who made the offer withdraws it at the handover instead.
      waitingActions={online && canAct(from.id) ? withdraw : null}
    >
      <div className="trade-slip-wrap">
        <div className="trade-slip">
          {round > 0 && (
            <span key={`stamp-${round}`} className="slip-stamp" style={{ ['--stamp-ink' as string]: inkOnPaper(from.color) }}>
              {T.trade.counterStamp(round)}
            </span>
          )}
          <SlipSide s={s} player={from} side={offer.give} before={prev ? sideOf(prev, from.id) : null} label={label(from, youFrom)} />
          <div className="slip-perf" aria-hidden="true">
            <ArrowLeftRight />
          </div>
          <SlipSide s={s} player={to} side={offer.get} before={prev ? sideOf(prev, to.id) : null} label={label(to, youTo)} />
        </div>
      </div>
      <p className="muted small">{T.trade.mortgagedNote}</p>
    </Panel>
  );
}
