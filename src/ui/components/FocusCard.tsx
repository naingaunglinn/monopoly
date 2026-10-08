// The Focus Card (property deed, a luggage tag): the hovered, focused or pinned tile, otherwise the
// current player's tile.
import { Pin } from 'lucide-react';
import { BALANCE, mortgageValue } from '../../data/balance';
import { AIRPORT_BY_SPACE, BOARD, CITY_BY_SPACE, COMPANY_BY_SPACE, COUNTRY_CITIES } from '../../data/board';
import { COUNTRY_BY_ID } from '../../data/countries';
import { airportsOwnedBy, countryOwner, ownsCountry, type GameState } from '../../engine';
import { readableInk } from '../contrast';
import { ui, useUi } from '../store';
import { money, SPECIAL_TEXT, T } from '../strings';
import { isRestSpace, tileView } from '../view';
import { Flag } from './Flag';
import { BuildingPips, TokenChip } from './glyphs';
import { spaceIcon } from './icons';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`deed-row ${strong ? 'is-strong' : ''}`}>
      <dt>{label}</dt>
      <dd className="money">{value}</dd>
    </div>
  );
}

export function cityRentRows(baseRent: number): Array<{ key: string; label: string; rent: number }> {
  return [
    { key: 'base', label: T.rules.incompleteRow, rent: baseRent },
    ...BALANCE.cityRentMultipliers.map((m, level) => ({
      key: `l${level}`,
      label: level === 0 ? T.focus.completeEmpty : level === 5 ? T.focus.hotel : T.focus.houses(level),
      rent: baseRent * m,
    })),
  ];
}

export function DeedBody({ s, index }: { s: GameState; index: number }) {
  const v = tileView(s, index);
  const ps = s.properties[index];
  const owner = v.owner;
  const city = CITY_BY_SPACE.get(index);
  const airport = AIRPORT_BY_SPACE.get(index);
  const company = COMPANY_BY_SPACE.get(index);
  const ownerRow = (
    <div className="deed-owner">
      {owner ? (
        <>
          <TokenChip token={owner.token} color={owner.color} size={18} />
          <span>{owner.name}</span>
        </>
      ) : (
        <span className="muted">{T.focus.unowned}</span>
      )}
    </div>
  );
  const mortgage = (price: number) => (
    <>
      <Row label={T.focus.mortgage} value={money(mortgageValue(price))} />
      <Row label={T.focus.status} value={ps?.mortgaged ? T.focus.mortgaged : T.focus.notMortgaged} />
    </>
  );

  if (city) {
    const country = COUNTRY_BY_ID[city.country];
    const cities = COUNTRY_CITIES[city.country];
    const complete = owner ? ownsCountry(s, owner.id, city.country) : false;
    const holder = countryOwner(s, city.country);
    const ownedByOwner = owner ? cities.filter((sp) => s.properties[sp]?.owner === owner.id).length : 0;
    const currentRow = !owner ? null : !complete ? 'base' : `l${ps?.level ?? 0}`;
    return (
      <>
        {ownerRow}
        <dl className="deed-rows">
          <Row label={T.focus.price} value={money(city.price)} />
          <Row label={T.focus.houseCost} value={money(city.houseCost)} />
          <Row label={T.focus.hotelCost} value={money(city.houseCost * BALANCE.hotelCostMultiplier)} />
        </dl>
        <table className="rent-table">
          <caption>{T.focus.rent}</caption>
          <tbody>
            {cityRentRows(city.baseRent).map((row) => (
              <tr key={row.key} className={row.key === currentRow ? 'is-current' : ''}>
                <th scope="row">{row.label}</th>
                <td className="money">{money(row.rent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="deed-rows">
          <div className="deed-row">
            <dt>{T.focus.level}</dt>
            <dd>
              {ps && ps.level > 0 ? <BuildingPips level={ps.level} /> : null}
              <span>{ps && ps.level > 0 ? T.tile.level(ps.level) : T.focus.noBuilding}</span>
            </dd>
          </div>
          {mortgage(city.price)}
          <div className="deed-row">
            <dt>{T.focus.country}</dt>
            <dd>
              {holder !== null
                ? T.focus.complete
                : owner
                  ? `${T.focus.countryProgress(ownedByOwner, cities.length)} (${country.name})`
                  : T.focus.countryProgress(0, cities.length)}
            </dd>
          </div>
        </dl>
      </>
    );
  }
  if (airport) {
    const owned = owner ? airportsOwnedBy(s, owner.id) : 0;
    return (
      <>
        {ownerRow}
        <dl className="deed-rows">
          <Row label={T.focus.price} value={money(airport.price)} />
        </dl>
        <table className="rent-table ladder">
          <caption>{T.focus.rent}</caption>
          <tbody>
            {BALANCE.airportRent.map((rent, i) => (
              <tr key={i} className={owned === i + 1 ? 'is-current' : ''}>
                <th scope="row">{T.focus.airportsOwned(i + 1)}</th>
                <td className="money">{money(rent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="deed-rows">{mortgage(airport.price)}</dl>
        <p className="deed-note">{T.focus.noAirportSet}</p>
      </>
    );
  }
  if (company) {
    return (
      <>
        {ownerRow}
        <dl className="deed-rows">
          <Row label={T.focus.price} value={money(company.price)} />
          <Row label={T.focus.rent} value={T.focus.companyFormula(company.multiplier)} strong />
          {mortgage(company.price)}
        </dl>
        <p className="deed-note">
          {T.focus.companyBetween(COUNTRY_BY_ID[company.between[0]].name, COUNTRY_BY_ID[company.between[1]].name)}
        </p>
      </>
    );
  }
  const space = BOARD[index];
  const key = isRestSpace(s, index)
    ? 'rest'
    : space?.type === 'tax'
      ? space.tax === 'income'
        ? 'incomeTax'
        : 'luxuryTax'
      : (space?.type as keyof typeof SPECIAL_TEXT);
  return (
    <div className="deed-special">
      <p className="deed-landing">{T.focus.landHere}</p>
      <p>{SPECIAL_TEXT[key]}</p>
    </div>
  );
}

/** The few numbers that matter when deciding to buy: rent now and with a full set. */
export function DeedSummary({ s, index }: { s: GameState; index: number }) {
  const city = CITY_BY_SPACE.get(index);
  const airport = AIRPORT_BY_SPACE.get(index);
  const company = COMPANY_BY_SPACE.get(index);
  const me = s.turn.currentPlayerIndex;
  if (city) {
    const cities = COUNTRY_CITIES[city.country];
    const mine = cities.filter((sp) => s.properties[sp]?.owner === me).length;
    return (
      <dl className="deed-summary">
        <Row label={T.focus.rent} value={money(city.baseRent)} />
        <Row label={T.focus.completeEmpty} value={money(city.baseRent * (BALANCE.cityRentMultipliers[0] as number))} />
        <Row label={T.focus.hotel} value={money(city.baseRent * (BALANCE.cityRentMultipliers[5] as number))} />
        <Row label={T.focus.houseCost} value={money(city.houseCost)} />
        <Row label={COUNTRY_BY_ID[city.country].name} value={T.focus.countryProgress(mine, cities.length)} />
      </dl>
    );
  }
  if (airport) {
    const owned = airportsOwnedBy(s, me);
    return (
      <dl className="deed-summary">
        <Row label={T.focus.airportsOwned(owned + 1)} value={money(BALANCE.airportRent[owned] as number)} />
        <Row label={T.focus.airportsOwned(10)} value={money(BALANCE.airportRent[9] as number)} />
        <Row label={T.focus.mortgage} value={money(mortgageValue(airport.price))} />
      </dl>
    );
  }
  if (company) {
    return (
      <dl className="deed-summary">
        <Row label={T.focus.rent} value={T.focus.companyFormula(company.multiplier)} />
        <Row label={T.focus.mortgage} value={money(mortgageValue(company.price))} />
      </dl>
    );
  }
  return null;
}

export function FocusCard({ s, fallback }: { s: GameState; fallback: number }) {
  const { hover, pinned } = useUi();
  const index = hover ?? pinned ?? fallback;
  const v = tileView(s, index);
  const Icon = spaceIcon(v.space, isRestSpace(s, index));
  // Cities wear their country colour; everything else wears the Ocean.
  const band = v.space.type === 'city' && v.country ? v.country.color : '#12436B';
  return (
    <article
      className="deed"
      style={{ ['--band' as string]: band, ['--band-ink' as string]: readableInk(band) }}
      aria-live="polite"
      aria-label={v.name}
      data-space={index}
    >
      <div className="deed-tag">
      <header className="deed-head">
        <span className="deed-eyelet" aria-hidden="true" />
        <span className="deed-mark">
          {v.country && v.space.type !== 'company' ? (
            <Flag code={v.country.flag} width={24} />
          ) : (
            Icon && <Icon size={20} aria-hidden="true" />
          )}
        </span>
        <div className="deed-title">
          <h2 className="deed-name">{v.name}</h2>
          {v.space.type === 'city' && v.country && <span className="deed-country">{v.country.name}</span>}
        </div>
        {pinned === index && (
          <button type="button" className="icon-btn deed-pin" onClick={() => ui.set({ pinned: null })} aria-label={T.focus.unpin} title={T.focus.unpin}>
            <Pin size={16} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="deed-body">
        <DeedBody s={s} index={index} />
      </div>
      </div>
    </article>
  );
}
