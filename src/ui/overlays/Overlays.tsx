// Board-covering screens (pass-device, property list, trade, results) and small dialogs.
import { ArrowLeftRight, Check, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AIRPORT_BY_SPACE, COMPANY_BY_SPACE, COUNTRY_CITIES, propertyPrice } from '../../data/board';
import { COUNTRIES } from '../../data/countries';
import { mortgageValue, unmortgageCost } from '../../data/balance';
import {
  countryOf,
  freeActor,
  ranking,
  sellRefund,
  tradeBlocker,
  validateAction,
  type GameState,
  type Player,
  type TradeOffer,
} from '../../engine';
import { countryHasBuildings } from '../../engine/core';
import { Button } from '../components/Button';
import { Flag } from '../components/Flag';
import { BuildingPips, TokenChip } from '../components/glyphs';
import { askConfirm, closeConfirm, closeSheet, dispatch, goTo, ui, useUi } from '../store';
import { money, QUICK_HELP, RULE_LINK, T, TOKEN_NAMES } from '../strings';
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
}: {
  id: string;
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useFocusTrap();
  return (
    <div className="sheet-backdrop" data-sheet={id}>
      <div ref={ref} className={`sheet ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="sheet-head">
          <h2 id={`${id}-title`} className="sheet-title">
            {title}
          </h2>
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

export function PassDevice({ s }: { s: GameState }) {
  const p = s.players[s.turn.currentPlayerIndex] as Player;
  const ref = useFocusTrap();
  return (
    <div className="pass-device" style={{ ['--player' as string]: p.color }} data-sheet="pass">
      <div ref={ref} className="pass-card" role="dialog" aria-modal="true" aria-labelledby="pass-title">
        <p className="pass-kicker">{T.pass.title}</p>
        <TokenChip token={p.token} color={p.color} size={96} title={TOKEN_NAMES[p.token]} />
        <h2 id="pass-title" className="pass-name">
          {T.pass.to(p.name)}
        </h2>
        <Button id="pass-ready" variant="primary" label={T.play.ready} action={{ type: 'ready' }} autoFocus />
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
        <BuildingPips level={ps.level} size={10} />
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

export function PropertyList({ s, player }: { s: GameState; player: number }) {
  const p = s.players[player] as Player;
  const actor = freeActor(s);
  const owned = s.properties.map((ps, i) => (ps && ps.owner === player ? i : -1)).filter((i) => i >= 0);
  const groups = COUNTRIES.map((c) => ({ country: c, spaces: COUNTRY_CITIES[c.id].filter((sp) => owned.includes(sp)) })).filter(
    (g) => g.spaces.length > 0,
  );
  const airports = owned.filter((sp) => AIRPORT_BY_SPACE.has(sp));
  const companies = owned.filter((sp) => COMPANY_BY_SPACE.has(sp));
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
      {actor !== player && owned.length > 0 && <p className="muted">{T.properties.viewOnly}</p>}
      {owned.length === 0 && <p className="muted">{T.properties.none}</p>}
      <div className="prop-groups">
        {groups.map((g) => (
          <section key={g.country.id} className="prop-group" style={{ ['--band' as string]: g.country.color }}>
            <h3 className="prop-group-title">
              <Flag code={g.country.flag} width={18} />
              {g.country.name}
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

/** The current player (or the debtor) builds an offer: one partner, two columns. */
export function TradeBuilder({ s }: { s: GameState }) {
  const actorId = freeActor(s);
  const me = actorId !== null ? (s.players[actorId] as Player) : null;
  const partners = s.players.filter((p) => !p.bankrupt && p.id !== actorId);
  const [partnerId, setPartnerId] = useState<number>(partners[0]?.id ?? -1);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState('');
  const [getCash, setGetCash] = useState('');
  const [giveCards, setGiveCards] = useState(0);
  const [getCards, setGetCards] = useState(0);
  const partner = s.players[partnerId];
  const offer: TradeOffer | null =
    me && partner
      ? {
          from: me.id,
          to: partner.id,
          give: { properties: give, cash: Number(giveCash || 0), jailCards: giveCards },
          get: { properties: get, cash: Number(getCash || 0), jailCards: getCards },
        }
      : null;
  const problem = offer ? tradeBlocker(s, offer)?.reason ?? null : T.error.title;
  const toggle = (list: number[], set: (v: number[]) => void, space: number) =>
    set(list.includes(space) ? list.filter((x) => x !== space) : [...list, space]);
  if (!me) return null;
  return (
    <Sheet
      id="trade"
      title={
        <span className="sheet-title-row">
          <ArrowLeftRight size={22} aria-hidden="true" />
          {T.trade.title}
        </span>
      }
      onClose={closeSheet}
      wide
      footer={
        <>
          <Button id="trade-cancel" label={T.trade.cancel} onClick={closeSheet} />
          <Button
            id="trade-send"
            variant="primary"
            label={T.trade.send}
            reason={problem}
            showReason
            onClick={() => {
              if (!offer) return;
              if (!dispatch({ type: 'proposeTrade', offer }, 'trade-send')) closeSheet();
            }}
          />
        </>
      }
    >
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
                  setGet([]);
                  setGetCash('');
                  setGetCards(0);
                }}
              />
              <TokenChip token={p.token} color={p.color} size={18} />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {partner && (
        <div className="trade-cols">
          <TradeColumn
            s={s}
            owner={me}
            title={T.trade.youGive}
            picked={give}
            onToggle={(sp) => toggle(give, setGive, sp)}
            cash={giveCash}
            onCash={setGiveCash}
            cards={giveCards}
            onCards={setGiveCards}
            idPrefix="give"
          />
          <TradeColumn
            s={s}
            owner={partner}
            title={T.trade.youGet}
            picked={get}
            onToggle={(sp) => toggle(get, setGet, sp)}
            cash={getCash}
            onCash={setGetCash}
            cards={getCards}
            onCards={setGetCards}
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

function OfferSide({ s, side, title }: { s: GameState; side: TradeOffer['give']; title: string }) {
  const empty = side.properties.length === 0 && side.cash === 0 && side.jailCards === 0;
  return (
    <section className="trade-col">
      <h3 className="trade-col-title">{title}</h3>
      {empty && <p className="muted">{T.trade.nothing}</p>}
      <ul className="trade-items">
        {side.properties.map((space) => {
          const country = countryOfSpace(space);
          return (
            <li key={space} className="trade-item">
              {country ? <Flag code={country.flag} width={16} /> : null}
              <span>{spaceName(s, space)}</span>
              {s.properties[space]?.mortgaged && <span className="badge badge-warn">{T.focus.mortgaged}</span>}
            </li>
          );
        })}
        {side.cash > 0 && <li className="trade-item money">{money(side.cash)}</li>}
        {side.jailCards > 0 && (
          <li className="trade-item">
            {side.jailCards} × {T.players.jailCard}
          </li>
        )}
      </ul>
    </section>
  );
}

/** "Hand the device to the partner", then Accept (with confirmation) or Reject. */
export function TradeResponse({ s }: { s: GameState }) {
  const offer = s.flow.trade as TradeOffer;
  const from = s.players[offer.from] as Player;
  const to = s.players[offer.to] as Player;
  const [handed, setHanded] = useState(false);
  const ref = useFocusTrap();
  if (!handed) {
    return (
      <div className="pass-device" style={{ ['--player' as string]: to.color }} data-sheet="trade-handover">
        <div ref={ref} className="pass-card" role="dialog" aria-modal="true" aria-labelledby="handover-title">
          <p className="pass-kicker">{T.trade.title}</p>
          <TokenChip token={to.token} color={to.color} size={96} />
          <h2 id="handover-title" className="pass-name">
            {T.trade.handTo(to.name)}
          </h2>
          <Button id="handover-ready" variant="primary" label={T.play.ready} onClick={() => setHanded(true)} autoFocus />
        </div>
      </div>
    );
  }
  return (
    <Sheet
      id="trade-offer"
      title={T.trade.offerFrom(from.name)}
      wide
      footer={
        <>
          <Button id="trade-reject" label={T.trade.reject} icon={<X size={18} aria-hidden="true" />} action={{ type: 'respondTrade', accept: false }} />
          <Button
            id="trade-accept"
            variant="primary"
            label={T.trade.accept}
            icon={<Check size={18} aria-hidden="true" />}
            onClick={() => askConfirm({ kind: 'acceptTrade' })}
          />
        </>
      }
    >
      <p className="panel-whose" style={{ ['--player' as string]: to.color }}>
        <TokenChip token={to.token} color={to.color} size={18} />
        {T.panels.whose(to.name)}
      </p>
      <div className="trade-cols">
        <OfferSide s={s} side={offer.give} title={T.trade.theyGive(from.name)} />
        <OfferSide s={s} side={offer.get} title={T.trade.youGiveBack} />
      </div>
      <p className="muted small">{T.trade.mortgagedNote}</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------

export function Results({ s }: { s: GameState }) {
  const rows = useMemo(() => ranking(s), [s]);
  return (
    <Sheet
      id="results"
      title={T.results.title}
      onClose={closeSheet}
      wide
      footer={
        <>
          <Button id="results-close" label={T.results.close} onClick={closeSheet} />
          <Button id="results-new" variant="primary" label={T.results.newGame} onClick={() => askConfirm({ kind: 'newGame' })} />
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

export function SettingsDialog({ s }: { s: GameState }) {
  return (
    <Sheet id="settings" title={T.settings.title} onClose={closeSheet}>
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
      <p className="muted small">{T.settings.passDeviceHint}</p>
      <fieldset className="field">
        <legend className="field-label">{T.settings.animation}</legend>
        <div className="segmented" role="radiogroup" aria-label={T.settings.animation}>
          {(['normal', 'fast', 'off'] as const).map((speed) => (
            <label key={speed} className={`segment ${s.meta.settings.animationSpeed === speed ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="speed"
                checked={s.meta.settings.animationSpeed === speed}
                onChange={() => dispatch({ type: 'setAnimationSpeed', speed })}
              />
              <span>{T.setup.speed[speed]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Sheet>
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
          <Button id="confirm-yes" variant={confirm.kind === 'bankruptcy' ? 'danger' : 'primary'} label={yes} onClick={onYes} autoFocus />
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
  const help = QUICK_HELP[quickHelp];
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

