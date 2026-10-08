// One compact card per player. The current player's card is larger with a solid border in their
// colour. Clicking a card opens that player's property list.
import { BedDouble, IdCard, House, Lock, TreePalm } from 'lucide-react';
import { airportsOwnedBy, citiesOwnedBy, companiesOwnedBy, type GameState, type Player } from '../../engine';
import { shownCash, useDisplay } from '../display';
import { openSheet } from '../store';
import { money, T } from '../strings';
import { TokenChip } from './glyphs';

function PlayerCard({ s, p, cash, isCurrent }: { s: GameState; p: Player; cash: number; isCurrent: boolean }) {
  const cities = citiesOwnedBy(s, p.id);
  const airports = airportsOwnedBy(s, p.id);
  const companies = companiesOwnedBy(s, p.id);
  return (
    <li>
      <button
        type="button"
        className={`player-card ${isCurrent ? 'is-current' : ''} ${p.bankrupt ? 'is-bankrupt' : ''}`}
        style={{ ['--player' as string]: p.color }}
        onClick={() => openSheet({ kind: 'properties', player: p.id })}
        aria-label={`${T.players.open(p.name)}. ${money(cash)}${isCurrent ? `, ${T.players.current}` : ''}`}
        aria-current={isCurrent ? 'true' : undefined}
        data-player={p.id}
      >
        <span className="pc-head">
          <TokenChip token={p.token} color={p.color} size={isCurrent ? 26 : 20} />
          <span className="pc-name">{p.name}</span>
          <span className="pc-cash money">{p.bankrupt ? '—' : money(cash)}</span>
        </span>
        {!p.bankrupt && (
          <span className="pc-counts">
            <span>{T.players.cities(cities)}</span>
            <span>{T.players.airports(airports)}</span>
            <span>{T.players.companies(companies)}</span>
          </span>
        )}
        <span className="pc-badges">
          {p.bankrupt && <span className="badge badge-bankrupt">{T.players.bankrupt}</span>}
          {p.inJail && (
            <span className="badge badge-jail">
              <Lock size={12} aria-hidden="true" />
              {T.players.inJail}
            </span>
          )}
          {p.skipNextTurn && (
            <span className="badge badge-vacation">
              <TreePalm size={12} aria-hidden="true" />
              {T.players.onVacation}
            </span>
          )}
          {!p.bankrupt && s.meta.settings.freeStay && (
            <span className="badge badge-soft" title={T.players.freeStay(p.freeStay)}>
              <BedDouble size={12} aria-hidden="true" />
              {T.players.freeStay(p.freeStay)}
            </span>
          )}
          {p.jailCards.length > 0 && (
            <span className="badge badge-soft" title={T.players.jailCard}>
              <IdCard size={12} aria-hidden="true" />
              {p.jailCards.length}
            </span>
          )}
          {p.houseVouchers.length > 0 && (
            <span className="badge badge-soft" title={T.players.voucher}>
              <House size={12} aria-hidden="true" />
              {p.houseVouchers.length}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function PlayersColumn({ s }: { s: GameState }) {
  const display = useDisplay();
  const current = s.flow.phase === 'GameOver' ? -1 : s.turn.currentPlayerIndex;
  return (
    <section className="players-col" aria-label={T.players.title}>
      <ul className="player-list">
        {s.players.map((p) => (
          <PlayerCard key={p.id} s={s} p={p} cash={shownCash(s, display, p.id)} isCurrent={p.id === current} />
        ))}
      </ul>
    </section>
  );
}
