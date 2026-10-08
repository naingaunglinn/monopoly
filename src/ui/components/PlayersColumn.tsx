// One compact card per player. The current player's card is larger with a solid border in their
// colour. Clicking a card opens that player's property list. Money changes float beside the card.
import { BedDouble, Building2, Factory, House, IdCard, Lock, Plane, TreePalm } from 'lucide-react';
import { airportsOwnedBy, citiesOwnedBy, companiesOwnedBy, type GameState, type Player } from '../../engine';
import { shownCash, useDisplay, type FloatAmount } from '../display';
import { openSheet } from '../store';
import { money, signedMoney, T } from '../strings';
import { TokenChip } from './glyphs';

function PlayerCard({
  s,
  p,
  cash,
  isCurrent,
  floats,
  pulse,
  compact,
}: {
  s: GameState;
  p: Player;
  cash: number;
  isCurrent: boolean;
  floats: FloatAmount[];
  pulse: number | null;
  /** Five or six players: counts become icon + number so every card fits. */
  compact: boolean;
}) {
  const cities = citiesOwnedBy(s, p.id);
  const airports = airportsOwnedBy(s, p.id);
  const companies = companiesOwnedBy(s, p.id);
  return (
    <li className="player-slot">
      <button
        key={pulse ?? 'still'}
        type="button"
        className={`player-card ${isCurrent ? 'is-current' : ''} ${p.bankrupt ? 'is-bankrupt' : ''} ${pulse !== null ? 'pulse-once' : ''}`}
        style={{ ['--player' as string]: p.color }}
        onClick={() => openSheet({ kind: 'properties', player: p.id })}
        aria-label={`${T.players.open(p.name)}. ${money(cash)}${isCurrent ? `, ${T.players.current}` : ''}${
          p.inJail ? `, ${T.players.inJail}` : ''
        }${p.skipNextTurn ? `, ${T.players.onVacation}` : ''}${p.bankrupt ? `, ${T.players.bankrupt}` : ''}`}
        aria-current={isCurrent ? 'true' : undefined}
        data-player={p.id}
      >
        <span className="pc-head">
          <TokenChip token={p.token} color={p.color} size={isCurrent ? 'var(--pc-token-current)' : 'var(--pc-token)'} />
          <span className="pc-name">{p.name}</span>
          <span className="pc-cash money">{p.bankrupt ? T.players.bankrupt : money(cash)}</span>
        </span>
        {!p.bankrupt && !compact && (
          <span className="pc-counts">
            <span>{T.players.cities(cities)}</span>
            <span>{T.players.airports(airports)}</span>
            <span>{T.players.companies(companies)}</span>
          </span>
        )}
        {!p.bankrupt && compact && (
          <span className="pc-counts is-compact">
            <span title={T.players.cities(cities)}>
              <Building2 aria-hidden="true" />
              {cities}
              <span className="sr-only">{T.players.cities(cities)}</span>
            </span>
            <span title={T.players.airports(airports)}>
              <Plane aria-hidden="true" />
              {airports}
              <span className="sr-only">{T.players.airports(airports)}</span>
            </span>
            <span title={T.players.companies(companies)}>
              <Factory aria-hidden="true" />
              {companies}
              <span className="sr-only">{T.players.companies(companies)}</span>
            </span>
            {s.meta.settings.freeStay && (
              <span title={T.players.freeStay(p.freeStay)}>
                <BedDouble aria-hidden="true" />
                {p.freeStay}
                <span className="sr-only">{T.players.freeStay(p.freeStay)}</span>
              </span>
            )}
          </span>
        )}
        <span className="pc-badges">
          {p.inJail && (
            <span className="badge badge-jail">
              <Lock aria-hidden="true" />
              {T.players.inJail}
            </span>
          )}
          {p.skipNextTurn && (
            <span className="badge badge-vacation">
              <TreePalm aria-hidden="true" />
              {T.players.onVacation}
            </span>
          )}
          {!p.bankrupt && !compact && s.meta.settings.freeStay && (
            <span className="badge badge-soft" title={T.players.freeStay(p.freeStay)}>
              <BedDouble aria-hidden="true" />
              {T.players.freeStay(p.freeStay)}
            </span>
          )}
          {p.jailCards.length > 0 && (
            <span className="badge badge-soft" title={T.players.jailCard}>
              <IdCard aria-hidden="true" />
              {p.jailCards.length}
              <span className="sr-only">{T.players.jailCard}</span>
            </span>
          )}
          {p.houseVouchers.length > 0 && (
            <span className="badge badge-soft" title={T.players.voucher}>
              <House aria-hidden="true" />
              {p.houseVouchers.length}
              <span className="sr-only">{T.players.voucher}</span>
            </span>
          )}
        </span>
      </button>
      {floats.map((f) => (
        <span key={f.id} className={`money-float ${f.amount > 0 ? 'is-gain' : 'is-loss'}`} aria-hidden="true">
          {signedMoney(f.amount)}
        </span>
      ))}
    </li>
  );
}

export function PlayersColumn({ s }: { s: GameState }) {
  const display = useDisplay();
  const current = s.flow.phase === 'GameOver' ? -1 : s.turn.currentPlayerIndex;
  const compact = s.players.length >= 5;
  return (
    <section className="players-col" aria-label={T.players.title}>
      <ul className={`player-list ${compact ? 'is-compact' : ''}`}>
        {s.players.map((p) => (
          <PlayerCard
            key={p.id}
            compact={compact}
            s={s}
            p={p}
            cash={shownCash(s, display, p.id)}
            isCurrent={p.id === current}
            floats={display.floats.filter((f) => f.player === p.id)}
            pulse={display.pulse?.player === p.id ? display.pulse.id : null}
          />
        ))}
      </ul>
    </section>
  );
}
