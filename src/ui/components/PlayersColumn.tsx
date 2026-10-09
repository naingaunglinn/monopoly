// One compact card per player. The current player's card is larger with a solid border in their
// colour. Clicking a card opens that player's property list. Money changes float beside the card.
// Online, a card also shows when its player is disconnected or played by the host, and the host
// gets Play for them and Remove for a disconnected player.
import { BedDouble, Building2, Factory, Gamepad2, House, IdCard, Lock, Plane, TreePalm, UserX, WifiOff } from 'lucide-react';
import { airportsOwnedBy, citiesOwnedBy, companiesOwnedBy, type GameState, type Player } from '../../engine';
import { shownCash, useDisplay, type FloatAmount } from '../display';
import { amHost, hostControl, isSeatConnected, useOnline, usePresenceClock, type OnlineState } from '../session/online';
import { askConfirm, openSheet, showToast } from '../store';
import { money, signedMoney, T } from '../strings';
import { TokenChip } from './glyphs';
import { VoiceBadge } from './Voice';

export interface SeatNet {
  seatId: string;
  offline: boolean;
  proxyName: string | null;
  proxyMine: boolean;
  hostControls: boolean;
}

/** Online: a player's connection, who plays for them, and whether this device's host may step in. */
export function seatNet(online: OnlineState | null, s: GameState, p: Player): SeatNet | null {
  const seat = online?.view.seats[p.id];
  if (!online || !seat) return null;
  const mine = online.mine.includes(p.id);
  const offline = !mine && !p.bankrupt && !isSeatConnected(online, seat.id);
  const proxy = seat.proxy;
  return {
    seatId: seat.id,
    offline,
    proxyName: proxy !== null ? (online.view.seats[proxy]?.name ?? null) : null,
    proxyMine: proxy !== null && online.mine.includes(proxy),
    hostControls: amHost(online) && !mine && !p.bankrupt && s.flow.phase !== 'GameOver' && (offline || (proxy !== null && online.mine.includes(proxy))),
  };
}

const report = (err: string | null) => {
  if (err) showToast(err);
};

function PlayerCard({
  s,
  p,
  cash,
  isCurrent,
  floats,
  pulse,
  compact,
  net,
}: {
  s: GameState;
  p: Player;
  cash: number;
  isCurrent: boolean;
  floats: FloatAmount[];
  pulse: number | null;
  /** Five or six players: counts become icon + number so every card fits. */
  compact: boolean;
  /** Online: this player's connection and the host's controls. */
  net: SeatNet | null;
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
        data-seat-anchor={p.id}
        data-money-anchor={p.id}
      >
        <span className="pc-head">
          <span className="pc-token">
            <TokenChip token={p.token} color={p.color} size={isCurrent ? 'var(--pc-token-current)' : 'var(--pc-token)'} />
            {net && <VoiceBadge seatId={net.seatId} />}
          </span>
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
          {net?.offline && (
            <span className="badge badge-offline">
              <WifiOff aria-hidden="true" />
              {T.online.disconnected}
            </span>
          )}
          {net?.proxyName && (
            <span className="badge badge-soft">
              <Gamepad2 aria-hidden="true" />
              {net.proxyMine ? T.online.youPlayFor : T.online.playedBy(net.proxyName)}
            </span>
          )}
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
      {net?.hostControls && <HostControls p={p} net={net} />}
    </li>
  );
}

/**
 * The host's controls for a disconnected player (or one they play for): Play for them (or Stop
 * playing for them) and Remove. On player cards, and in the property list when the cards are not
 * on screen (room play on large screens, D97), with ids prefixed there.
 */
export function HostControls({ p, net, idPrefix = '' }: { p: Player; net: SeatNet; idPrefix?: string }) {
  return (
    <span className="pc-host">
      {net.proxyMine ? (
        <button type="button" className="btn btn-chip" id={`${idPrefix}stop-play-${p.id}`} onClick={() => void hostControl('stopPlayingFor', net.seatId).then(report)}>
          {T.online.stopPlayingFor}
        </button>
      ) : (
        <button type="button" className="btn btn-chip" id={`${idPrefix}play-for-${p.id}`} onClick={() => void hostControl('playFor', net.seatId).then(report)}>
          <Gamepad2 size={15} aria-hidden="true" />
          {T.online.playFor}
        </button>
      )}
      <button
        type="button"
        className="btn btn-chip btn-chip-danger"
        id={`${idPrefix}remove-${p.id}`}
        onClick={() => askConfirm({ kind: 'removePlayer', seatId: net.seatId, name: p.name })}
      >
        <UserX size={15} aria-hidden="true" />
        {T.online.remove}
      </button>
    </span>
  );
}

export function PlayersColumn({ s }: { s: GameState }) {
  const display = useDisplay();
  const online = useOnline();
  usePresenceClock();
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
            net={seatNet(online, s, p)}
          />
        ))}
      </ul>
    </section>
  );
}
