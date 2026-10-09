// Room play on large screens (owner request, D97): the players sit in the top bar. This device's
// player is shown in full (token, name, cash, what they own, Free Stay, held cards, Jail or
// Vacation); every other player as their money only, with a small sign on the token when they are
// in Jail, on Vacation, disconnected or played by someone else. A chip opens that player's
// properties (and, for the host, Play for them and Remove); the current player's chip wears a ring
// in their colour. Money changes float under the chips, and coins and stamps land on them.
import { BedDouble, Building2, Factory, Gamepad2, House, IdCard, Lock, Plane, TreePalm, WifiOff, type LucideIcon } from 'lucide-react';
import {
  airportsOwnedBy,
  citiesOwnedBy,
  companiesOwnedBy,
  decisionMaker,
  type GameState,
  type Player,
} from '../../engine';
import { ownedTileColor } from '../contrast';
import { shownCash, useDisplay, type FloatAmount } from '../display';
import { usePresenceClock, type OnlineState } from '../session/online';
import { openSheet } from '../store';
import { money, signedMoney, T } from '../strings';
import { TokenChip } from './glyphs';
import { seatNet, type SeatNet } from './PlayersColumn';
import { VoiceBadge } from './Voice';

/**
 * This device's player: the one deciding now when it is one of this device's seats (two people on
 * one laptop), else the one whose turn it is if it is theirs, else the device's first seat.
 */
export function myPlayer(s: GameState, online: OnlineState): number | null {
  const decider = decisionMaker(s);
  if (decider !== null && online.mine.includes(decider)) return decider;
  if (online.mine.includes(s.turn.currentPlayerIndex)) return s.turn.currentPlayerIndex;
  return online.mine[0] ?? null;
}

function Floats({ floats }: { floats: FloatAmount[] }) {
  return (
    <>
      {floats.map((f) => (
        <span key={f.id} className={`money-float ${f.amount > 0 ? 'is-gain' : 'is-loss'}`} aria-hidden="true">
          {signedMoney(f.amount)}
        </span>
      ))}
    </>
  );
}

function Count({ icon: Icon, n, label }: { icon: LucideIcon; n: number; label: string }) {
  return (
    <span className="tb-count" title={label}>
      <Icon aria-hidden="true" />
      {n}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Words for a player's state, for labels and tooltips. */
function statusWords(p: Player, net: SeatNet | null): string[] {
  return [
    p.bankrupt ? T.players.bankrupt : null,
    net?.offline ? T.online.disconnected : null,
    net?.proxyName ? (net.proxyMine ? T.online.youPlayFor : T.online.playedBy(net.proxyName)) : null,
    p.inJail ? T.players.inJail : null,
    p.skipNextTurn ? T.players.onVacation : null,
  ].filter((w): w is string => w !== null);
}

interface ChipProps {
  s: GameState;
  p: Player;
  cash: number;
  current: boolean;
  floats: FloatAmount[];
  pulse: number | null;
  net: SeatNet | null;
}

/** This device's player, in full. */
function MeChip({ s, p, cash, current, floats, pulse, net }: ChipProps) {
  const cities = citiesOwnedBy(s, p.id);
  const airports = airportsOwnedBy(s, p.id);
  const companies = companiesOwnedBy(s, p.id);
  const words = statusWords(p, net);
  return (
    <div className="tb-slot">
      <button
        key={pulse ?? 'still'}
        type="button"
        id="tb-me"
        className={`tb-me ${current ? 'is-current' : ''} ${p.bankrupt ? 'is-bankrupt' : ''} ${pulse !== null ? 'pulse-once' : ''}`}
        style={{ ['--player' as string]: p.color, ['--me-tint' as string]: ownedTileColor(p.color, false) }}
        title={[p.name, ...words].join(' · ')}
        onClick={() => openSheet({ kind: 'properties', player: p.id })}
        aria-label={[T.players.open(p.name), money(cash), current ? T.players.current : null, ...words].filter(Boolean).join(', ')}
        aria-current={current ? 'true' : undefined}
        data-player={p.id}
        data-seat-anchor={p.id}
        data-money-anchor={p.id}
      >
        <span className="pc-token">
          <TokenChip token={p.token} color={p.color} size="var(--me-token)" />
          {net && <VoiceBadge seatId={net.seatId} />}
        </span>
        <span className="tb-me-name">{p.name}</span>
        <span className="tb-me-cash money">{p.bankrupt ? T.players.bankrupt : money(cash)}</span>
        {!p.bankrupt && (
          <span className="tb-counts">
            <Count icon={Building2} n={cities} label={T.players.cities(cities)} />
            <Count icon={Plane} n={airports} label={T.players.airports(airports)} />
            <Count icon={Factory} n={companies} label={T.players.companies(companies)} />
            {s.meta.settings.freeStay && <Count icon={BedDouble} n={p.freeStay} label={T.players.freeStay(p.freeStay)} />}
            {p.jailCards.length > 0 && <Count icon={IdCard} n={p.jailCards.length} label={T.players.jailCard} />}
            {p.houseVouchers.length > 0 && <Count icon={House} n={p.houseVouchers.length} label={T.players.voucher} />}
          </span>
        )}
        {p.inJail && (
          <span className="badge badge-jail tb-badge" title={T.players.inJail}>
            <Lock aria-hidden="true" />
            <span className="tb-badge-label">{T.players.inJail}</span>
          </span>
        )}
        {p.skipNextTurn && (
          <span className="badge badge-vacation tb-badge" title={T.players.onVacation}>
            <TreePalm aria-hidden="true" />
            <span className="tb-badge-label">{T.players.onVacation}</span>
          </span>
        )}
      </button>
      <Floats floats={floats} />
    </div>
  );
}

/**
 * One sign on the token's corner, the most useful first: played by someone (only a disconnected
 * player can be), disconnected, in Jail, on Vacation.
 */
function statusSign(p: Player, net: SeatNet | null): { kind: string; Icon: LucideIcon } | null {
  if (p.bankrupt) return null;
  if (net?.proxyName) return { kind: 'proxy', Icon: Gamepad2 };
  if (net?.offline) return { kind: 'offline', Icon: WifiOff };
  if (p.inJail) return { kind: 'jail', Icon: Lock };
  if (p.skipNextTurn) return { kind: 'vacation', Icon: TreePalm };
  return null;
}

/** Another player: their money only. */
function OtherChip({ p, cash, current, floats, pulse, net }: ChipProps) {
  const words = statusWords(p, net);
  const sign = statusSign(p, net);
  return (
    <li className="tb-slot">
      <button
        key={pulse ?? 'still'}
        type="button"
        id={`tb-player-${p.id}`}
        className={`tb-other ${current ? 'is-current' : ''} ${p.bankrupt ? 'is-bankrupt' : ''} ${net?.offline ? 'is-offline' : ''} ${pulse !== null ? 'pulse-once' : ''}`}
        style={{ ['--player' as string]: p.color }}
        title={[p.name, ...words].join(' · ')}
        onClick={() => openSheet({ kind: 'properties', player: p.id })}
        aria-label={[T.players.open(p.name), p.bankrupt ? null : money(cash), current ? T.players.current : null, ...words].filter(Boolean).join(', ')}
        aria-current={current ? 'true' : undefined}
        data-player={p.id}
        data-seat-anchor={p.id}
        data-money-anchor={p.id}
      >
        <span className="pc-token">
          <TokenChip token={p.token} color={p.color} size="var(--chip-token)" />
          {net && <VoiceBadge seatId={net.seatId} />}
          {sign && (
            <span className={`tb-sign sign-${sign.kind}`} aria-hidden="true">
              <sign.Icon />
            </span>
          )}
        </span>
        <span className="tb-other-cash money">{p.bankrupt ? T.players.out : money(cash)}</span>
      </button>
      <Floats floats={floats} />
    </li>
  );
}

/** The players in the top bar: this device's player first, then the others in seat order. */
export function RoomPlayers({ s, online }: { s: GameState; online: OnlineState }) {
  const display = useDisplay();
  usePresenceClock();
  const me = myPlayer(s, online);
  const current = s.flow.phase === 'GameOver' ? -1 : s.turn.currentPlayerIndex;
  const props = (p: Player): ChipProps => ({
    s,
    p,
    cash: shownCash(s, display, p.id),
    current: p.id === current,
    floats: display.floats.filter((f) => f.player === p.id),
    pulse: display.pulse?.player === p.id ? display.pulse.id : null,
    net: seatNet(online, s, p),
  });
  const mine = me !== null ? s.players[me] : undefined;
  return (
    <div className={`tb-players ${s.players.length >= 5 ? 'is-crowded' : ''}`} aria-label={T.players.title} role="group">
      {mine && <MeChip {...props(mine)} />}
      <ul className="tb-others">
        {s.players
          .filter((p) => p.id !== me)
          .map((p) => (
            <OtherChip key={p.id} {...props(p)} />
          ))}
      </ul>
    </div>
  );
}
