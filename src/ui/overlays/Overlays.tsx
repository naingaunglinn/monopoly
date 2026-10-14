// Board-covering screens (pass-device, property list, trade, results) and small dialogs.
import { ArrowLeftRight, Check, CircleHelp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AIRPORT_BY_SPACE, COMPANY_BY_SPACE, COUNTRIES, COUNTRY_CITIES, groupName, propertyPrice } from '../../data/board';
import { mortgageValue, unmortgageCost } from '../../data/balance';
import {
  countryOf,
  freeActor,
  ranking,
  sellRefund,
  validateAction,
  type Action,
  type GameState,
  type Player,
  type TradeOffer,
  type TradeSide,
} from '../../engine';
import { countryHasBuildings } from '../../engine/core';
import { REDUCED_MOTION_QUERY } from '../animation';
import { Button } from '../components/Button';
import { Flag } from '../components/Flag';
import { BuildingPips, TokenChip } from '../components/glyphs';
import { HostControls, seatNet } from '../components/PlayersColumn';
import { useMediaQuery } from '../hooks';
import { setPrefs, usePrefs } from '../prefs';
import { hostControl, leaveToStart, useOnline } from '../session/online';
import { playCue } from '../sound';
import {
  askConfirm,
  canAct,
  closeConfirm,
  closeSheet,
  dispatch,
  goTo,
  setAnimationSpeed,
  showToast,
  ui,
  useAnimationSpeed,
  useUi,
} from '../store';
import { LanguageField } from '../components/Fields';
import { money, quickHelp as quickHelpText, RULE_LINK, T, TOKEN_NAMES, type RuleTopicId } from '../strings';
import { defaultTrader, negotiation, tradersHere } from '../trading';
import { countryOfSpace, playerName, spaceName } from '../view';
import { openRules } from '../store';

/** Keeps keyboard focus inside a modal surface and returns it afterwards. */
export function useFocusTrap(active = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((n) => !n.hasAttribute('disabled') && n.offsetParent !== null);
    const first = el.querySelector<HTMLElement>('[autofocus]') ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const firstEl = list[0] as HTMLElement;
      const lastEl = list[list.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active]);
  return ref;
}

export function Sheet({
  id,
  title,
  onClose,
  children,
  footer,
  wide,
  help,
}: {
  id: string;
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Rule-guide topic for the small help button. */
  help?: RuleTopicId;
}) {
  const ref = useFocusTrap();
  return (
    <div className="sheet-backdrop" data-sheet={id}>
      <div ref={ref} className={`sheet ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="sheet-head">
          <h2 id={`${id}-title`} className="sheet-title">
            {title}
          </h2>
          {help && (
            <button
              type="button"
              className="icon-btn help-btn"
              onClick={() => openRules(help)}
              aria-label={`${T.panels.help}: ${typeof title === 'string' ? title : T.trade.title}`}
              title={T.panels.help}
            >
              <CircleHelp size={18} aria-hidden="true" />
            </button>
          )}
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label={T.properties.close} title={T.properties.close}>
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

/**
 * The handover between players on one device: the engine's pass-device phase locally, or (with
 * `player` and `onReady`) an online device passing from one of its seats to another.
 */
export function PassDevice({ s, player, onReady }: { s: GameState; player?: number; onReady?: () => void }) {
  const p = s.players[player ?? s.turn.currentPlayerIndex] as Player;
  const ref = useFocusTrap();
  return (
    <div className="pass-device" style={{ ['--player' as string]: p.color }} data-sheet="pass">
      <div ref={ref} className="pass-card" role="dialog" aria-modal="true" aria-labelledby="pass-title">
        <p className="pass-kicker">{T.pass.title}</p>
        <TokenChip token={p.token} color={p.color} size={96} title={TOKEN_NAMES[p.token]} />
        <h2 id="pass-title" className="pass-name">
          {T.pass.to(p.name)}
        </h2>
        <Button
          id="pass-ready"
          variant="primary"
          label={T.play.ready}
          action={onReady ? undefined : { type: 'ready' }}
          onClick={onReady}
          autoFocus
        />
        <p className="muted pass-hint">{T.pass.hint}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function PropertyRow({ s, space, actor }: { s: GameState; space: number; actor: number | null }) {
  const ps = s.properties[space];
  if (!ps) return null;
  const country = countryOfSpace(space);
  const canManage = actor !== null && ps.owner === actor;
  const sell = { type: 'sellBuilding', space } as const;
  const mortgage = { type: 'mortgage', space } as const;
  const unmortgage = { type: 'unmortgage', space } as const;
  const why = (a: Parameters<typeof validateAction>[1]) => validateAction(s, a)?.reason ?? null;
  return (
    <li className={`prop-row ${ps.mortgaged ? 'is-mortgaged' : ''}`} data-space={space}>
      <span className="prop-name">
        {country ? <Flag code={country.flag} width={18} /> : null}
        <span>{spaceName(s, space)}</span>
      </span>
      <span className="prop-state">
        <BuildingPips level={ps.level} />
        {ps.mortgaged ? <span className="badge badge-warn">{T.focus.mortgaged}</span> : null}
        <span className="muted money">{money(propertyPrice(space))}</span>
      </span>
      {canManage && (
        <span className="prop-actions">
          {ps.level > 0 && (
            <Button
              id={`sell-${space}`}
              label={ps.level === 5 ? T.properties.sellHotel(sellRefund(space, 5)) : T.properties.sellHouse(sellRefund(space, ps.level))}
              reason={why(sell)}
              action={sell}
            />
          )}
          {ps.mortgaged ? (
            <Button
              id={`unmortgage-${space}`}
              label={T.properties.unmortgage(unmortgageCost(propertyPrice(space)))}
              reason={why(unmortgage)}
              action={unmortgage}
            />
          ) : (
            <Button
              id={`mortgage-${space}`}
              label={T.properties.mortgage(mortgageValue(propertyPrice(space)))}
              reason={why(mortgage)}
              action={mortgage}
            />
          )}
        </span>
      )}
    </li>
  );
}

/** A player's properties grouped by country, with sell and mortgage buttons for the free actor. */
export function PropertyGroups({ s, player }: { s: GameState; player: number }) {
  const actor = freeActor(s);
  const owned = s.properties.map((ps, i) => (ps && ps.owner === player ? i : -1)).filter((i) => i >= 0);
  const groups = COUNTRIES.map((c) => ({ country: c, spaces: COUNTRY_CITIES[c.id].filter((sp) => owned.includes(sp)) })).filter(
    (g) => g.spaces.length > 0,
  );
  const airports = owned.filter((sp) => AIRPORT_BY_SPACE.has(sp));
  const companies = owned.filter((sp) => COMPANY_BY_SPACE.has(sp));
  return (
    <>
      {actor !== player && owned.length > 0 && <p className="muted">{T.properties.viewOnly}</p>}
      {owned.length === 0 && <p className="muted">{T.properties.none}</p>}
      <div className="prop-groups">
        {groups.map((g) => (
          <section key={g.country.id} className="prop-group" style={{ ['--band' as string]: g.country.color }}>
            <h3 className="prop-group-title">
              <Flag code={g.country.flag} width={18} />
              {groupName(g.country.id)}
              <span className="muted">
                {T.focus.countryProgress(g.spaces.length, COUNTRY_CITIES[g.country.id].length)}
              </span>
            </h3>
            <ul className="prop-list">
              {g.spaces.map((sp) => (
                <PropertyRow key={sp} s={s} space={sp} actor={actor} />
              ))}
            </ul>
          </section>
        ))}
        {airports.length > 0 && (
          <section className="prop-group">
            <h3 className="prop-group-title">{T.properties.airports}</h3>
            <ul className="prop-list">
              {airports.map((sp) => (
                <PropertyRow key={sp} s={s} space={sp} actor={actor} />
              ))}
            </ul>
          </section>
        )}
        {companies.length > 0 && (
          <section className="prop-group">
            <h3 className="prop-group-title">{T.properties.companies}</h3>
            <ul className="prop-list">
              {companies.map((sp) => (
                <PropertyRow key={sp} s={s} space={sp} actor={actor} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

export function PropertyList({ s, player }: { s: GameState; player: number }) {
  const p = s.players[player] as Player;
  const online = useOnline();
  // Room play on large screens has no player cards: the host's controls for a player are here (D97).
  const net = online ? seatNet(online, s, p) : null;
  return (
    <Sheet
      id="properties"
      title={
        <span className="sheet-title-row">
          <TokenChip token={p.token} color={p.color} size={24} />
          {T.properties.title(p.name)}
        </span>
      }
      onClose={closeSheet}
      wide
    >
      {net?.hostControls && (
        <div className="sheet-host">
          <p className="muted">
            {[net.offline ? T.online.disconnected : null, net.proxyName ? (net.proxyMine ? T.online.youPlayFor : T.online.playedBy(net.proxyName)) : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <HostControls p={p} net={net} idPrefix="sheet-" />
        </div>
      )}
      <PropertyGroups s={s} player={player} />
      {(p.jailCards.length > 0 || p.houseVouchers.length > 0) && (
        <p className="muted">
          {T.properties.held}: {p.jailCards.length > 0 ? `${p.jailCards.length} × ${T.players.jailCard}` : ''}
          {p.jailCards.length > 0 && p.houseVouchers.length > 0 ? ', ' : ''}
          {p.houseVouchers.length > 0 ? `${p.houseVouchers.length} × ${T.players.voucher}` : ''}
        </p>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------

function tradeableSpaces(s: GameState, owner: number): Array<{ space: number; blocked: string | null }> {
  return s.properties
    .map((ps, space) => ({ ps, space }))
    .filter(({ ps }) => ps && ps.owner === owner)
    .map(({ space }) => {
      const c = countryOf(space);
      const blocked = c !== null && countryHasBuildings(s, c) ? T.trade.blocked(COUNTRIES.find((x) => x.id === c)?.name ?? '') : null;
      return { space, blocked };
    });
}

function TradeColumn({
  s,
  owner,
  title,
  picked,
  onToggle,
  cash,
  onCash,
  cards,
  onCards,
  idPrefix,
}: {
  s: GameState;
  owner: Player;
  title: string;
  picked: number[];
  onToggle: (space: number) => void;
  cash: string;
  onCash: (v: string) => void;
  cards: number;
  onCards: (n: number) => void;
  idPrefix: string;
}) {
  const items = tradeableSpaces(s, owner.id);
  return (
    <section className="trade-col" aria-label={title}>
      <h3 className="trade-col-title">
        <TokenChip token={owner.token} color={owner.color} size={20} />
        {title}
      </h3>
      {items.length === 0 && <p className="muted">{T.trade.none}</p>}
      <ul className="trade-items">
        {items.map(({ space, blocked }) => {
          const country = countryOfSpace(space);
          const ps = s.properties[space];
          return (
            <li key={space}>
              <label className={`trade-item ${blocked ? 'is-blocked' : ''}`} title={blocked ?? undefined}>
                <input
                  type="checkbox"
                  checked={picked.includes(space)}
                  disabled={blocked !== null}
                  onChange={() => onToggle(space)}
                  data-space={space}
                />
                {country ? <Flag code={country.flag} width={16} /> : null}
                <span>{spaceName(s, space)}</span>
                {ps?.mortgaged && <span className="badge badge-warn">{T.focus.mortgaged}</span>}
                {blocked && <span className="muted small">{blocked}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <label className="trade-cash">
        <span>{T.trade.cash}</span>
        <span className="money-input">
          <span aria-hidden="true">$</span>
          <input
            id={`${idPrefix}-cash`}
            inputMode="numeric"
            value={cash}
            placeholder="0"
            onChange={(e) => onCash(e.target.value.replace(/[^0-9]/g, ''))}
            aria-label={`${title}: ${T.trade.cash}`}
          />
        </span>
        <span className="muted small">{money(owner.cash)}</span>
      </label>
      {owner.jailCards.length > 0 && (
        <label className="trade-cash">
          <span>{T.trade.jailCards}</span>
          <select value={cards} onChange={(e) => onCards(Number(e.target.value))} aria-label={`${title}: ${T.trade.jailCards}`}>
            {Array.from({ length: owner.jailCards.length + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

/** A side of an offer as the builder's inputs. */
interface Draft {
  props: number[];
  cash: string;
  cards: number;
}

const draftOf = (side: TradeSide | null): Draft => ({
  props: side ? [...side.properties] : [],
  cash: side && side.cash > 0 ? String(side.cash) : '',
  cards: side?.jailCards ?? 0,
});

/**
 * The trade builder (spec 7.2, D99): who offers (any player this device can act for), one partner
 * and two columns. With `counter` it answers the offer on the table: the partner is fixed and the
 * columns start from that offer, turned round. It stays open until the offer is on the table, so a
 * refused offer (sent at a busy moment) can be sent again.
 */
export function TradeBuilder({ s, counter = false }: { s: GameState; counter?: boolean }) {
  const table = s.flow.trade;
  const traders = tradersHere(s);
  const [meId, setMeId] = useState<number | null>(() => (counter ? (table?.to ?? null) : defaultTrader(s, traders)));
  const me = meId !== null ? (s.players[meId] ?? null) : null;
  const partners = s.players.filter((p) => !p.bankrupt && p.id !== meId);
  const [partnerId, setPartnerId] = useState<number>(() => (counter ? (table?.from ?? -1) : (partners[0]?.id ?? -1)));
  // A counter-offer starts from the offer on the table: what they asked of me, what they offered me.
  const [give, setGive] = useState<Draft>(() => draftOf(counter && table ? table.get : null));
  const [get, setGet] = useState<Draft>(() => draftOf(counter && table ? table.give : null));
  const sent = useRef(false);
  const partner = s.players[partnerId];
  const offer: TradeOffer | null =
    me && partner
      ? {
          from: me.id,
          to: partner.id,
          give: { properties: give.props, cash: Number(give.cash || 0), jailCards: give.cards },
          get: { properties: get.props, cash: Number(get.cash || 0), jailCards: get.cards },
        }
      : null;
  const action: Action | null = offer ? (counter ? { type: 'counterTrade', offer } : { type: 'proposeTrade', offer }) : null;
  const problem = action ? (validateAction(s, action)?.reason ?? null) : T.trade.pickPartner;
  // Close once this offer is on the table, or when the offer being answered is gone.
  useEffect(() => {
    if (counter && (!table || !canAct(table.to)) && !(sent.current && table?.from === meId)) closeSheet();
    else if (sent.current && table && table.from === meId) closeSheet();
  }, [counter, table, meId]);
  const toggle = (draft: Draft, set: (d: Draft) => void, space: number) =>
    set({ ...draft, props: draft.props.includes(space) ? draft.props.filter((x) => x !== space) : [...draft.props, space] });
  if (!me) return null;
  const pickMe = (id: number) => {
    setMeId(id);
    setGive(draftOf(null));
    if (id === partnerId) {
      setPartnerId(s.players.find((p) => !p.bankrupt && p.id !== id)?.id ?? -1);
      setGet(draftOf(null));
    }
  };
  return (
    <Sheet
      id="trade"
      title={
        <span className="sheet-title-row">
          <ArrowLeftRight size={22} aria-hidden="true" />
          {counter && partner ? T.trade.counterTitle(partner.name) : T.trade.title}
        </span>
      }
      onClose={closeSheet}
      wide
      help="trading"
      footer={
        <>
          <Button id="trade-cancel" label={T.trade.cancel} onClick={closeSheet} />
          <Button
            id="trade-send"
            variant="primary"
            label={counter ? T.trade.sendCounter : T.trade.send}
            reason={problem}
            showReason
            onClick={() => {
              if (!action) return;
              sent.current = true;
              dispatch(action, 'trade-send');
            }}
          />
        </>
      }
    >
      {!counter && traders.length > 1 && (
        <fieldset className="field">
          <legend className="field-label">{T.trade.from}</legend>
          <div className="segmented" role="radiogroup" aria-label={T.trade.from}>
            {traders.map((id) => {
              const p = s.players[id] as Player;
              return (
                <label key={id} className={`segment ${id === meId ? 'is-on' : ''}`}>
                  <input type="radio" name="trader" checked={id === meId} onChange={() => pickMe(id)} />
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
          <legend className="field-label">{T.trade.partner}</legend>
          <div className="segmented" role="radiogroup" aria-label={T.trade.partner}>
            {partners.map((p) => (
              <label key={p.id} className={`segment ${p.id === partnerId ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="partner"
                  checked={p.id === partnerId}
                  onChange={() => {
                    setPartnerId(p.id);
                    setGet(draftOf(null));
                  }}
                />
                <TokenChip token={p.token} color={p.color} size={18} />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {partner && (
        <div className="trade-cols">
          <TradeColumn
            s={s}
            owner={me}
            title={traders.length > 1 && !counter ? T.trade.theyGive(me.name) : T.trade.youGive}
            picked={give.props}
            onToggle={(sp) => toggle(give, setGive, sp)}
            cash={give.cash}
            onCash={(cash) => setGive({ ...give, cash })}
            cards={give.cards}
            onCards={(cards) => setGive({ ...give, cards })}
            idPrefix="give"
          />
          <TradeColumn
            s={s}
            owner={partner}
            title={traders.length > 1 && !counter ? T.trade.theyGive(partner.name) : T.trade.youGet}
            picked={get.props}
            onToggle={(sp) => toggle(get, setGet, sp)}
            cash={get.cash}
            onCash={(cash) => setGet({ ...get, cash })}
            cards={get.cards}
            onCards={(cards) => setGet({ ...get, cards })}
            idPrefix="get"
          />
        </div>
      )}
      <p className="muted small">
        {T.trade.mortgagedNote} {T.trade.notTradeable}
      </p>
    </Sheet>
  );
}

/**
 * On one shared device (or two seats on one device online), the answer is handed over first: "Hand
 * the device to Leo". The player who made the offer can still take it back here.
 */
export function TradeHandover({ s }: { s: GameState }) {
  const offer = s.flow.trade as TradeOffer;
  const to = s.players[offer.to] as Player;
  const online = useOnline();
  // Online the partner answers on their own device: no handover unless both seats are on this one.
  const needed = online === null || (canAct(offer.to) && canAct(offer.from));
  const [handed, setHanded] = useState(!needed);
  const ref = useFocusTrap(!handed);
  if (handed) return null;
  return (
    <div className="pass-device" style={{ ['--player' as string]: to.color }} data-sheet="trade-handover">
      <div ref={ref} className="pass-card" role="dialog" aria-modal="true" aria-labelledby="handover-title">
        <p className="pass-kicker">{negotiation(s).round > 0 ? T.trade.counter : T.trade.title}</p>
        <TokenChip token={to.token} color={to.color} size={96} />
        <h2 id="handover-title" className="pass-name">
          {T.trade.handTo(to.name)}
        </h2>
        <Button id="handover-ready" variant="primary" label={T.play.ready} onClick={() => setHanded(true)} autoFocus />
        <Button id="handover-withdraw" label={T.trade.withdraw} action={{ type: 'withdrawTrade' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function Results({ s }: { s: GameState }) {
  const rows = useMemo(() => ranking(s), [s]);
  const online = useOnline();
  return (
    <Sheet
      id="results"
      title={T.results.title}
      onClose={closeSheet}
      wide
      footer={
        <>
          <Button id="results-close" label={T.results.close} onClick={closeSheet} />
          {online ? (
            <Button id="results-new" variant="primary" label={T.online.backToStart} onClick={() => leaveToStart()} />
          ) : (
            <Button id="results-new" variant="primary" label={T.results.newGame} onClick={() => askConfirm({ kind: 'newGame' })} />
          )}
        </>
      }
    >
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">{T.results.rank}</th>
            <th scope="col">{T.results.player}</th>
            <th scope="col">{T.results.cash}</th>
            <th scope="col">{T.results.property}</th>
            <th scope="col">{T.results.buildings}</th>
            <th scope="col">{T.results.airports}</th>
            <th scope="col">{T.results.companies}</th>
            <th scope="col">{T.results.netWorth}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const p = s.players[row.player] as Player;
            return (
              <tr key={row.player} className={`${row.winner ? 'is-winner' : ''} ${row.bankrupt ? 'is-bankrupt' : ''}`}>
                <td>{row.rank}</td>
                <th scope="row">
                  <span className="owner-line">
                    <TokenChip token={p.token} color={p.color} size={20} />
                    {p.name}
                    {row.winner && <span className="badge badge-good">{T.results.winner}</span>}
                    {row.bankrupt && <span className="badge badge-bankrupt">{T.results.bankrupt}</span>}
                  </span>
                </th>
                <td className="money">{money(row.worth.cash)}</td>
                <td className="money">{money(row.worth.cities)}</td>
                <td className="money">{money(row.worth.buildings)}</td>
                <td className="money">{money(row.worth.airports)}</td>
                <td className="money">{money(row.worth.companies)}</td>
                <td className="money strong">{money(row.worth.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------

/** Settings live in the top-bar menu as a popover; they never cover the board. */
export function SettingsFields({ s }: { s: GameState }) {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const prefs = usePrefs();
  const animationSpeed = useAnimationSpeed();
  const online = useOnline();
  return (
    <div className="settings-fields">
      <p className="menu-heading">{T.settings.title}</p>
      {!online && (
      <label className="toggle" htmlFor="set-pass">
        <input
          id="set-pass"
          type="checkbox"
          role="switch"
          checked={s.meta.settings.passDevice}
          onChange={(e) => dispatch({ type: 'setPassDevice', on: e.target.checked })}
        />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
        <span className="toggle-label">{T.settings.passDevice}</span>
      </label>
      )}
      <fieldset className="field compact">
        <legend className="field-label">{T.settings.animation}</legend>
        <div className="segmented" role="radiogroup" aria-label={T.settings.animation}>
          {(['normal', 'fast', 'off'] as const).map((speed) => (
            <label key={speed} className={`segment ${animationSpeed === speed ? 'is-on' : ''}`}>
              <input type="radio" name="speed" checked={animationSpeed === speed} onChange={() => setAnimationSpeed(speed)} />
              <span>{T.setup.speed[speed]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {s.meta.settings.map === 'myanmar' && <LanguageField compact />}
      <SoundFields />
      {online && <VoiceVolume />}
      {reducedMotion && (
        <label className="toggle" htmlFor="set-motion">
          <input
            id="set-motion"
            type="checkbox"
            role="switch"
            checked={prefs.motionAnyway}
            onChange={(e) => setPrefs({ motionAnyway: e.target.checked })}
          />
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">{T.settings.motionAnyway}</span>
        </label>
      )}
    </div>
  );
}

/** How loud the others' voices play on this device (online). */
function VoiceVolume() {
  const prefs = usePrefs();
  const percent = Math.round(prefs.voiceVolume * 100);
  return (
    <label className="volume" htmlFor="set-voice-volume">
      <span className="volume-label">{T.voice.volume}</span>
      <input
        id="set-voice-volume"
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-valuetext={T.settings.volumeValue(percent)}
        onChange={(e) => setPrefs({ voiceVolume: Number(e.target.value) / 100 })}
      />
      <span className="volume-value">{T.settings.volumeValue(percent)}</span>
    </label>
  );
}

/** Sound effects on this device: on or off, and how loud (a short tick previews the level). */
function SoundFields() {
  const prefs = usePrefs();
  const percent = Math.round(prefs.soundVolume * 100);
  return (
    <>
      <label className="toggle" htmlFor="set-sound">
        <input
          id="set-sound"
          type="checkbox"
          role="switch"
          checked={prefs.soundOn}
          onChange={(e) => {
            setPrefs({ soundOn: e.target.checked });
            if (e.target.checked) playCue('tick');
          }}
        />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
        <span className="toggle-label">{T.settings.sound}</span>
      </label>
      <label className={`volume ${prefs.soundOn ? '' : 'is-disabled'}`} htmlFor="set-volume">
        <span className="volume-label">{T.settings.volume}</span>
        <input
          id="set-volume"
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={!prefs.soundOn}
          aria-valuetext={T.settings.volumeValue(percent)}
          onChange={(e) => setPrefs({ soundVolume: Number(e.target.value) / 100 })}
          onPointerUp={() => playCue('tick')}
          onKeyUp={(e) => e.key.startsWith('Arrow') && playCue('tick')}
        />
        <span className="volume-value">{T.settings.volumeValue(percent)}</span>
      </label>
    </>
  );
}

export function ConfirmDialog({ s }: { s: GameState }) {
  const { confirm } = useUi();
  const ref = useFocusTrap(confirm !== null);
  if (!confirm) return null;
  let title = '';
  let text = '';
  let yes = '';
  let onYes = () => undefined as void;
  if (confirm.kind === 'newGame') {
    title = T.confirm.newGameTitle;
    text = T.confirm.newGameText;
    yes = T.confirm.newGameYes;
    onYes = () => {
      closeConfirm();
      goTo('setup');
    };
  } else if (confirm.kind === 'removePlayer') {
    title = T.online.removeTitle(confirm.name);
    text = T.online.removeText(confirm.name, s.meta.settings.mode === 'quick');
    yes = T.online.removeYes;
    onYes = () => {
      closeConfirm();
      void hostControl('remove', confirm.seatId).then((err) => err && showToast(err));
    };
  } else if (confirm.kind === 'bankruptcy') {
    const debt = s.flow.debts[0];
    title = T.confirm.bankruptTitle;
    text = debt ? T.confirm.bankruptText(playerName(s, debt.debtor), playerName(s, debt.creditor)) : '';
    yes = T.confirm.bankruptYes;
    onYes = () => {
      closeConfirm();
      ui.set({ sheet: null });
      dispatch({ type: 'declareBankruptcy' });
    };
  } else {
    title = T.confirm.tradeTitle;
    text = T.confirm.tradeText;
    yes = T.confirm.tradeYes;
    onYes = () => {
      closeConfirm();
      dispatch({ type: 'respondTrade', accept: true });
    };
  }
  return (
    <div className="modal-backdrop" data-sheet="confirm">
      <div ref={ref} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
        <h2 id="confirm-title" className="dialog-title">
          {title}
        </h2>
        <p id="confirm-text">{text}</p>
        <div className="dialog-actions">
          <Button id="confirm-cancel" label={T.confirm.cancel} onClick={closeConfirm} />
          <Button
            id="confirm-yes"
            variant={confirm.kind === 'bankruptcy' || confirm.kind === 'removePlayer' ? 'danger' : 'primary'}
            label={yes}
            onClick={onYes}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const { toast } = useUi();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className="toast" role="status">
      <Check size={16} aria-hidden="true" />
      {toast.text}
    </div>
  );
}

export function QuickHelpPopover() {
  const { quickHelp } = useUi();
  if (!quickHelp) return null;
  const help = quickHelpText()[quickHelp];
  return (
    <div className="quick-help" role="note">
      <p>{help.lines[0]}</p>
      <p>{help.lines[1]}</p>
      <div className="quick-help-actions">
        <button type="button" className="link-btn" onClick={() => openRules(help.topic)}>
          {RULE_LINK}
        </button>
        <button type="button" className="icon-btn" onClick={() => ui.set({ quickHelp: null })} aria-label={T.rules.close}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

