// The decision panels (spec section 12). They open by themselves after landing, sit over the play
// area and the log, and show the information plus their secondary actions. The primary action is
// always the yellow button in the action bar.
import {
  Ban,
  Coins,
  Gavel,
  Hammer,
  LockKeyhole,
  Newspaper,
  Receipt,
  Tag,
  Ticket,
  TreePalm,
  TriangleAlert,
  Trophy,
} from 'lucide-react';
import { useState } from 'react';
import { BALANCE } from '../../data/balance';
import { CITY_BY_SPACE, COMPANY_BY_SPACE, COUNTRY_CITIES, propertyPrice } from '../../data/board';
import { COUNTRY_BY_ID } from '../../data/countries';
import {
  buildQuote,
  canRaiseMoney,
  cardById,
  cityRent,
  minimumBid,
  ranking,
  validateAction,
  type GameState,
  type Notice,
  type Player,
} from '../../engine';
import { Button } from '../components/Button';
import { DeedSummary } from '../components/FocusCard';
import { Flag } from '../components/Flag';
import { BuildingPips, TokenChip } from '../components/glyphs';
import { CARD_ICONS, COMPANY_ICONS } from '../components/icons';
import { leaveToStart } from '../session/online';
import { askConfirm, dispatch, openSheet, refuse, useApp } from '../store';
import { levelText, money, rentCalcText, signedMoney, T } from '../strings';
import { countryOfSpace, decider, playerName, spaceName } from '../view';
import { Panel, QuickHelpButton } from './Panel';

const reason = (s: GameState, action: Parameters<typeof validateAction>[1]) => validateAction(s, action)?.reason ?? null;

function SpaceTitle({ index, s }: { index: number; s: GameState }) {
  const country = countryOfSpace(index);
  return (
    <span className="space-title">
      {country && <Flag code={country.flag} width={20} />}
      <span>{spaceName(s, index)}</span>
    </span>
  );
}

function BuyPanel({ s, space }: { s: GameState; space: number }) {
  const me = s.players[s.turn.currentPlayerIndex] as Player;
  const price = propertyPrice(space);
  // Too little cash: the engine says how much is missing, and the big button passes (D95).
  const refused = validateAction(s, { type: 'buy' });
  const needed = Number(refused?.params.needed ?? 0) - Number(refused?.params.have ?? 0);
  return (
    <Panel
      id="buy"
      icon={Tag}
      title={T.panels.buy.title(spaceName(s, space))}
      whose={me}
      help="buying"
      actions={
        <Button id="buy-pass" label={T.play.pass} keyHint="P" action={{ type: 'decline' }} />
      }
    >
      <div className="panel-split">
        <div className="mini-deed">
          <SpaceTitle s={s} index={space} />
          <DeedSummary s={s} index={space} />
        </div>
        <dl className="facts">
          <div className="fact">
            <dt>{T.panels.buy.price}</dt>
            <dd className="fact-big money">{money(price)}</dd>
          </div>
          <div className="fact">
            <dt>{T.panels.buy.cashAfter}</dt>
            <dd className={`money ${me.cash - price < 0 ? 'is-loss' : ''}`}>{money(me.cash - price)}</dd>
          </div>
          {refused && needed > 0 && <p className="fact-strong">{T.panels.buy.short(money(needed))}</p>}
          <p className="fact-hint">{s.meta.settings.auction ? T.panels.buy.passHint : T.panels.buy.passHintNoAuction}</p>
        </dl>
      </div>
    </Panel>
  );
}

function AuctionPanel({ s }: { s: GameState }) {
  const [custom, setCustom] = useState('');
  if (s.flow.pending?.kind !== 'auction') return null;
  const a = s.flow.pending.auction;
  const bidder = s.players[a.current] as Player;
  const min = minimumBid(a);
  const raises = BALANCE.auctionRaises.map((r) => a.highBid + r);
  const submitCustom = () => {
    const amount = Number(custom);
    if (!custom.trim() || !Number.isInteger(amount)) {
      refuse(T.panels.auction.minimum(min), 'bid-custom');
      return;
    }
    if (!dispatch({ type: 'bid', amount }, 'bid-custom')) setCustom('');
  };
  return (
    <Panel
      id="auction"
      icon={Gavel}
      title={T.panels.auction.title(spaceName(s, a.space))}
      whose={bidder}
      help="buying"
      actions={
        <div className="auction-controls">
          {raises.map((amount, i) => (
            <Button
              key={amount}
              id={`bid-${i}`}
              label={`+${money(BALANCE.auctionRaises[i] as number)}`}
              ariaLabel={T.play.bid(amount)}
              reason={reason(s, { type: 'bid', amount })}
              action={{ type: 'bid', amount }}
            />
          ))}
          <form
            className="custom-bid"
            onSubmit={(e) => {
              e.preventDefault();
              submitCustom();
            }}
          >
            <label className="sr-only" htmlFor="bid-amount">
              {T.panels.auction.custom}
            </label>
            <span className="money-input">
              <span aria-hidden="true">$</span>
              <input
                id="bid-amount"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={String(min)}
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </span>
            <button type="submit" id="bid-custom" className="btn btn-secondary">
              <span className="btn-label">{T.panels.auction.bidCustom}</span>
            </button>
          </form>
          <Button id="bid-fold" label={T.play.fold} variant="ghost" action={{ type: 'fold' }} />
        </div>
      }
    >
      <div className="panel-split">
        <dl className="facts">
          <div className="fact">
            <dt>{T.panels.auction.highBid}</dt>
            <dd className="fact-big money">
              {a.highBidder === null ? T.panels.auction.noBids : money(a.highBid)}
            </dd>
            {a.highBidder !== null && <dd className="muted">{T.panels.auction.by(playerName(s, a.highBidder))}</dd>}
          </div>
          <p className="fact-strong">{T.panels.auction.turn(bidder.name)}</p>
          <p className="muted">
            {T.panels.auction.yourCash(bidder.cash)} · {T.panels.auction.minimum(min)}
          </p>
        </dl>
        <ol className="bidders">
          {a.order.map((id) => {
            const p = s.players[id] as Player;
            const active = a.active.includes(id);
            return (
              <li key={id} className={`bidder ${id === a.current ? 'is-current' : ''} ${active ? '' : 'is-out'}`}>
                <TokenChip token={p.token} color={p.color} size={18} />
                <span>{p.name}</span>
                <span className="muted">{active ? T.panels.auction.active : T.panels.auction.folded}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}

function RentPanel({ s }: { s: GameState }) {
  if (s.flow.pending?.kind !== 'rent') return null;
  const rent = s.flow.pending.rent;
  const payer = s.players[rent.payer] as Player;
  const isTax = rent.calc.kind === 'tax';
  const owner = rent.creditor !== null ? (s.players[rent.creditor] as Player) : null;
  const isCompany = rent.calc.kind === 'company';
  const name = spaceName(s, rent.space);
  return (
    <Panel
      id="rent"
      icon={isTax ? Receipt : Coins}
      title={isTax ? T.panels.rent.taxTitle(name) : isCompany ? T.panels.company.title(name) : T.panels.rent.title(name)}
      whose={payer}
      help={isTax ? 'taxes' : isCompany ? 'companies' : rent.calc.kind === 'airport' ? 'airports' : 'citiesRent'}
      tone="bad"
      actions={
        rent.freeStayAllowed ? (
          <span className="inline-actions">
            <Button id="use-free-stay" label={T.panels.rent.freeStay(payer.freeStay)} action={{ type: 'useFreeStay' }} />
            <QuickHelpButton topic="freeStay" label={T.panels.rent.freeStayHint} />
          </span>
        ) : null
      }
    >
      <dl className="facts">
        <div className="fact">
          <dt>{owner ? T.panels.rent.owner : T.panels.rent.toBank}</dt>
          {owner && (
            <dd className="owner-line">
              <TokenChip token={owner.token} color={owner.color} size={18} />
              {owner.name}
            </dd>
          )}
        </div>
        <div className="fact">
          <dt>{T.panels.rent.amount}</dt>
          <dd className="fact-big money is-loss">{signedMoney(-rent.amount)}</dd>
        </div>
        <p className="calc">{rentCalcText(rent.calc, rent.amount, name)}</p>
        {rent.calc.kind === 'airport' && (
          <p className="muted with-help">
            <QuickHelpButton topic="airports" label={T.focus.noAirportSet} />
          </p>
        )}
      </dl>
    </Panel>
  );
}

function CompanyPanel({ s }: { s: GameState }) {
  if (s.flow.pending?.kind !== 'companyRoll') return null;
  const { space, owner } = s.flow.pending;
  const company = COMPANY_BY_SPACE.get(space);
  return (
    <Panel
      id="company"
      icon={company ? COMPANY_ICONS[company.icon] : Coins}
      title={T.panels.company.title(spaceName(s, space))}
      whose={decider(s)}
      help="companies"
      tone="bad"
      actions={<QuickHelpButton topic="companies" label={T.panels.company.intro(playerName(s, owner))} />}
    >
      <p>{T.panels.company.intro(playerName(s, owner))}</p>
      {company && <p className="fact-strong">{T.focus.companyFormula(company.multiplier)}</p>}
    </Panel>
  );
}

/** One city of the country in the build panel: its buildings, rent now and its own Build button. */
function BuildRow({ s, me, space, here }: { s: GameState; me: Player; space: number; here: boolean }) {
  const city = CITY_BY_SPACE.get(space);
  const ps = s.properties[space];
  if (!city || !ps) return null;
  const level = ps.level;
  const quote = level < BALANCE.hotelLevel ? buildQuote(s, me.id, space) : null;
  const label = !quote
    ? T.panels.build.maxedShort
    : quote.nextLevel === BALANCE.hotelLevel
      ? T.panels.build.hotel(quote.cost)
      : quote.voucher
        ? T.panels.build.houseFree
        : T.panels.build.house(quote.cost);
  return (
    <li className={`build-row ${here ? 'is-here' : ''}`} aria-current={here ? 'location' : undefined}>
      <span className="build-city">
        <span className="build-name">{city.name}</span>
        {here && <span className="build-here">{T.panels.build.here}</span>}
      </span>
      <span className="level-line build-level">
        <BuildingPips level={level} />
        {levelText(level)}
      </span>
      <span className="build-rent">
        <span className="build-rent-label">{T.panels.build.rentNow}</span>
        <span className="money">{money(cityRent(s, space).amount)}</span>
      </span>
      {quote ? (
        <Button id={`build-${space}`} label={label} reason={reason(s, { type: 'build', space })} action={{ type: 'build', space }} />
      ) : (
        <span className="build-maxed">{label}</span>
      )}
    </li>
  );
}

/**
 * Building after landing on a city of a country the player owns whole: every city of that country,
 * each with its own Build button, enabled by the even rule and cash (5.8, D98).
 */
function BuildPanel({ s }: { s: GameState }) {
  if (s.flow.pending?.kind !== 'build') return null;
  const landed = s.flow.pending.space;
  const me = s.players[s.turn.currentPlayerIndex] as Player;
  const city = CITY_BY_SPACE.get(landed);
  if (!city) return null;
  return (
    <Panel
      id="build"
      icon={Hammer}
      title={T.panels.build.title(COUNTRY_BY_ID[city.country].name)}
      whose={me}
      help="houses"
      tone="good"
    >
      <ul className="build-list">
        {COUNTRY_CITIES[city.country].map((space) => (
          <BuildRow key={space} s={s} me={me} space={space} here={space === landed} />
        ))}
      </ul>
      <p className="muted">{T.panels.build.landingRule}</p>
    </Panel>
  );
}

function CardPanel({ s }: { s: GameState }) {
  if (s.flow.pending?.kind !== 'card') return null;
  const card = cardById(s.flow.pending.cardId);
  const Icon = CARD_ICONS[card.icon];
  const kept = card.effect.type === 'getOutOfJail' || card.effect.type === 'freeHouseVoucher';
  const isChance = card.deck === 'chance';
  return (
    <Panel
      id="card"
      icon={isChance ? Ticket : Newspaper}
      title={isChance ? T.panels.card.chance : T.panels.card.event}
      whose={decider(s)}
      help="cards"
      tone={card.tone === 'good' ? 'good' : card.tone === 'bad' ? 'bad' : 'neutral'}
      className={isChance ? 'card-chance' : 'card-event'}
    >
      {isChance ? (
        <div className={`boarding-pass tone-${card.tone}`}>
          <div className="bp-main">
            <span className="bp-label">
              <Ticket aria-hidden="true" />
              {T.panels.card.boarding}
            </span>
            <h3 className="bp-title">{card.title}</h3>
            <p className="bp-text">{card.text}</p>
          </div>
          <div className="bp-stub" aria-hidden="true">
            <Icon />
            <span className="bp-stub-label">{T.panels.card.chance}</span>
          </div>
        </div>
      ) : (
        <div className={`news-banner tone-${card.tone}`}>
          <div className="news-top">
            <span className="news-label">{T.panels.card.news}</span>
            <Icon className="news-icon" aria-hidden="true" />
          </div>
          <h3 className="news-title">{card.title}</h3>
          <p className="news-text">{card.text}</p>
        </div>
      )}
      {kept && <p className="muted">{T.panels.card.kept}</p>}
    </Panel>
  );
}

function JailPanel({ s }: { s: GameState }) {
  const me = s.players[s.turn.currentPlayerIndex] as Player;
  return (
    <Panel
      id="jail"
      icon={LockKeyhole}
      title={T.panels.jail.title(me.name)}
      whose={me}
      help="jail"
      tone="warn"
      actions={
        <span className="inline-actions">
          <Button
            id="jail-pay"
            label={T.panels.jail.pay(BALANCE.jailFine)}
            reason={reason(s, { type: 'payJailFine' })}
            showReason
            action={{ type: 'payJailFine' }}
          />
          {me.jailCards.length > 0 && <Button id="jail-card" label={T.panels.jail.useCard} action={{ type: 'useJailCard' }} />}
        </span>
      }
    >
      <p className="fact-strong">{T.panels.jail.attempts(me.jailAttempts, BALANCE.jailMaxAttempts)}</p>
      {me.jailAttempts === BALANCE.jailMaxAttempts - 1 && <p className="warn-text">{T.panels.jail.lastAttempt}</p>}
    </Panel>
  );
}

function VacationSkipPanel({ s }: { s: GameState }) {
  const me = s.players[s.turn.currentPlayerIndex] as Player;
  return (
    <Panel id="vacation-skip" icon={TreePalm} title={T.panels.vacation.skipTitle(me.name)} whose={me} help="vacation" tone="neutral">
      <p>{T.panels.vacation.skip}</p>
    </Panel>
  );
}

function NoticePanel({ s, notice }: { s: GameState; notice: Notice }) {
  const p = s.players[notice.player] as Player;
  if (notice.kind === 'vacation') {
    return (
      <Panel id="vacation" icon={TreePalm} title={T.panels.vacation.title} whose={p} help="vacation" tone="neutral">
        <p className="fact-strong">{T.panels.vacation.landed(p.name)}</p>
      </Panel>
    );
  }
  return (
    <Panel id="bankruptcy" icon={Ban} title={T.panels.bankruptcy.title(p.name)} help="debt" tone="bad">
      <p>{notice.creditor !== null ? T.panels.bankruptcy.toPlayer(playerName(s, notice.creditor)) : T.panels.bankruptcy.toBank}</p>
      <p className="fact-strong">{T.panels.bankruptcy.out}</p>
    </Panel>
  );
}

function DebtPanel({ s }: { s: GameState }) {
  const debt = s.flow.debts[0];
  if (!debt) return null;
  const debtor = s.players[debt.debtor] as Player;
  const shortfall = Math.max(0, debt.amount - debtor.cash);
  const sellable = s.properties.reduce((n, ps) => n + (ps && ps.owner === debtor.id ? ps.level : 0), 0);
  const mortgageable = s.properties.filter(
    (ps, i) => ps && ps.owner === debtor.id && validateAction(s, { type: 'mortgage', space: i }) === null,
  ).length;
  const r = debt.reason;
  const why =
    r.kind === 'rent'
      ? T.panels.debt.reason.rent(spaceName(s, r.space))
      : r.kind === 'tax'
        ? T.panels.debt.reason.tax(r.tax === 'income' ? 'Income Tax' : 'Luxury Tax')
        : r.kind === 'card'
          ? T.panels.debt.reason.card(cardById(r.cardId).title)
          : T.panels.debt.reason.jailFine;
  return (
    <Panel
      id="debt"
      icon={TriangleAlert}
      title={T.panels.debt.title(debtor.name)}
      whose={debtor}
      help="debt"
      tone="bad"
      actions={
        <span className="inline-actions">
          <Button
            id="debt-manage"
            label={T.panels.debt.manage}
            onClick={() => openSheet({ kind: 'properties', player: debtor.id })}
            reason={canRaiseMoney(s, debtor.id) ? null : T.panels.debt.options}
          />
          <Button id="debt-trade" label={T.panels.debt.trade} keyHint="T" onClick={() => openSheet({ kind: 'trade' })} />
          <Button id="debt-bankrupt" label={T.panels.debt.bankrupt} variant="danger" onClick={() => askConfirm({ kind: 'bankruptcy' })} />
        </span>
      }
    >
      <dl className="facts facts-grid">
        <div className="fact">
          <dt>{T.panels.debt.amount}</dt>
          <dd className="fact-big money is-loss">{money(debt.amount)}</dd>
          <dd className="muted">{why}</dd>
        </div>
        <div className="fact">
          <dt>{T.panels.debt.creditor}</dt>
          <dd>{debt.creditor === null ? T.panels.debt.bank : playerName(s, debt.creditor)}</dd>
        </div>
        <div className="fact">
          <dt>{T.panels.debt.cash}</dt>
          <dd className="money">{money(debtor.cash)}</dd>
        </div>
        <div className="fact">
          <dt>{T.panels.debt.shortfall}</dt>
          <dd className={`money ${shortfall > 0 ? 'is-loss' : 'is-gain'}`}>{shortfall > 0 ? money(shortfall) : T.panels.debt.covered}</dd>
        </div>
      </dl>
      <p className="muted">
        {T.panels.debt.options} {T.panels.debt.canSell(sellable)}; {T.panels.debt.canMortgage(mortgageable)}.
      </p>
    </Panel>
  );
}

export function WinnerPanel({ s }: { s: GameState }) {
  const rows = ranking(s);
  const winners = (s.meta.winner ?? []).map((id) => s.players[id] as Player);
  const top = rows[0];
  const first = winners[0];
  const { mode } = useApp();
  if (!first || !top) return null;
  const title = winners.length > 1 ? T.winner.shared(winners.map((w) => w.name).join(' and ')) : T.winner.wins(first.name);
  return (
    <section className="panel winner-panel" aria-labelledby="winner-title" data-panel="winner">
      <span className="sign sign-lg winner-sign" aria-hidden="true">
        <Trophy />
      </span>
      <div className="winner-tokens">
        {winners.map((w) => (
          <TokenChip key={w.id} token={w.token} color={w.color} size={64} />
        ))}
      </div>
      <h2 id="winner-title" className="winner-title">
        {title}
      </h2>
      {s.meta.endReason && <p className="muted">{T.winner.reason[s.meta.endReason]}</p>}
      <dl className="winner-stats">
        <div>
          <dt>{T.winner.netWorth}</dt>
          <dd className="fact-big money">{money(top.worth.total)}</dd>
        </div>
        <div>
          <dt>{T.results.property}</dt>
          <dd>{top.worth.cityCount}</dd>
        </div>
        <div>
          <dt>{T.results.airports}</dt>
          <dd>{top.worth.airportCount}</dd>
        </div>
        <div>
          <dt>{T.results.companies}</dt>
          <dd>{top.worth.companyCount}</dd>
        </div>
      </dl>
      <div className="panel-actions">
        <Button id="winner-results" variant="primary" label={T.winner.viewResults} onClick={() => openSheet({ kind: 'results' })} />
        {mode === 'online' ? (
          <Button id="winner-new" label={T.online.backToStart} onClick={() => leaveToStart()} />
        ) : (
          <Button id="winner-new" label={T.winner.newGame} onClick={() => askConfirm({ kind: 'newGame' })} />
        )}
      </div>
    </section>
  );
}

/** The panel for the current decision, or null when the play area should show the board info. */
export function ActivePanel({ s }: { s: GameState }) {
  const notice = s.flow.notices[0];
  if (notice) return <NoticePanel s={s} notice={notice} />;
  const pending = s.flow.pending;
  switch (s.flow.phase) {
    case 'TurnStart':
      return pending?.kind === 'vacationSkip' ? <VacationSkipPanel s={s} /> : <JailPanel s={s} />;
    case 'BuyDecision':
      return pending?.kind === 'buy' ? <BuyPanel s={s} space={pending.space} /> : null;
    case 'Auction':
      return <AuctionPanel s={s} />;
    case 'RentDue':
      return <RentPanel s={s} />;
    case 'CompanyRoll':
      return <CompanyPanel s={s} />;
    case 'CardReveal':
      return <CardPanel s={s} />;
    case 'BuildOffer':
      return <BuildPanel s={s} />;
    case 'Debt':
      return <DebtPanel s={s} />;
    case 'GameOver':
      return <WinnerPanel s={s} />;
    default:
      return null;
  }
}
