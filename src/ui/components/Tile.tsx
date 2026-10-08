// One board tile. Compact by design: the Focus Card shows the details at full size.
// An owned property takes a tint of its owner's colour behind the text, so white tiles are the
// ones still for sale (D54). The owner marker stays: ownership is never colour alone.
import { Hammer } from 'lucide-react';
import { memo, type KeyboardEvent } from 'react';
import { gridPosition } from '../../data/board';
import type { GameState } from '../../engine';
import { ownedTileColor, PATH_TINT, tint } from '../contrast';
import { useDisplay } from '../display';
import { PHONE_QUERY } from '../hooks';
import { ui } from '../store';
import { T } from '../strings';
import { isRestSpace, rowTileName, tileView } from '../view';
import { Flag } from './Flag';
import { BuildingPips, TokenChip } from './glyphs';
import { spaceIcon } from './icons';

export type TileKind = 'corner' | 'card' | 'row';

function isPhoneLayout(): boolean {
  try {
    return window.matchMedia(PHONE_QUERY).matches;
  } catch {
    return false;
  }
}

export function tileKind(index: number): TileKind {
  const pos = gridPosition(index);
  if (pos.corner) return 'corner';
  return pos.side === 'top' || pos.side === 'bottom' ? 'card' : 'row';
}

interface TileProps {
  s: GameState;
  index: number;
  /** Colour of the current player if their token stands here, else null. */
  ring: string | null;
  focusable: boolean;
  onNavigate: (from: number, delta: number) => void;
}

function isPropertySpace(type: string): boolean {
  return type === 'city' || type === 'airport' || type === 'company';
}

function describe(s: GameState, index: number): string {
  const v = tileView(s, index);
  const parts = [v.name];
  if (v.country && v.space.type === 'city') parts.push(v.country.name);
  if (v.owner) parts.push(T.tile.owner(v.owner.name));
  else if (isPropertySpace(v.space.type)) parts.push(T.tile.forSale);
  if (v.value) parts.push(v.value);
  if (v.level > 0) parts.push(T.tile.level(v.level));
  if (v.canBuildNow) parts.push(T.tile.canBuild);
  return parts.join(', ');
}

function TileImpl({ s, index, ring, focusable, onNavigate }: TileProps) {
  const display = useDisplay();
  const v = tileView(s, index);
  const pos = gridPosition(index);
  const kind = tileKind(index);
  const rest = isRestSpace(s, index);
  const Icon = spaceIcon(v.space, rest);
  const isCity = v.space.type === 'city';
  const isProperty = isPropertySpace(v.space.type);
  const moverColor = display.mover !== null ? s.players[display.mover]?.color : undefined;
  const band = isCity && v.country ? v.country.color : undefined;
  const pip = display.pip?.space === index ? display.pip : null;
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      onNavigate(index, delta);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onNavigate(index, -index);
    }
  };
  const owner = v.owner ? (
    <TokenChip
      key={v.owner.id}
      className="owner-marker"
      token={v.owner.token}
      color={v.owner.color}
      size={kind === 'row' ? 'var(--owner-row)' : 'var(--owner-card)'}
      title={T.tile.owner(v.owner.name)}
    />
  ) : null;
  const flag = v.country ? <Flag code={v.country.flag} className="tile-flag" /> : null;
  const classes = [
    'tile',
    `tile-${kind}`,
    `side-${pos.side}`,
    `type-${v.space.type}`,
    ring ? 'is-current' : '',
    v.mortgaged ? 'is-mortgaged' : '',
    v.owner ? 'is-owned' : '',
    v.canBuildNow ? 'can-build' : '',
    rest ? 'is-rest' : '',
    display.lit.includes(index) ? 'is-lit' : '',
    display.glow === index ? 'is-landing' : '',
    display.flash === index ? 'is-flash' : '',
  ].join(' ');

  return (
    <button
      type="button"
      className={classes}
      data-space={index}
      style={{
        gridColumn: pos.col + 1,
        gridRow: pos.row + 1,
        ['--band' as string]: band,
        ['--ring' as string]: ring ?? undefined,
        ['--owned' as string]: v.owner ? ownedTileColor(v.owner.color, v.mortgaged) : undefined,
        ['--mover' as string]: moverColor,
        ['--path' as string]: moverColor ? tint(moverColor, PATH_TINT) : undefined,
      }}
      tabIndex={focusable ? 0 : -1}
      aria-label={describe(s, index)}
      onMouseEnter={() => ui.set({ hover: index })}
      onMouseLeave={() => ui.get().hover === index && ui.set({ hover: null })}
      onFocus={() => ui.set({ hover: index })}
      onBlur={() => ui.get().hover === index && ui.set({ hover: null })}
      onClick={() => ui.set({ pinned: ui.get().pinned === index && !isPhoneLayout() ? null : index })}
      onKeyDown={onKey}
    >
      {kind === 'corner' && (
        <span className="tile-corner-body">
          {Icon && (
            <span className="sign sign-lg" aria-hidden="true">
              <Icon />
            </span>
          )}
          <span className="tile-name">{v.name}</span>
        </span>
      )}
      {kind === 'card' && (
        <>
          <span className={`tile-band ${isCity ? 'band-country' : 'band-plain'}`}>
            {flag}
            {!isCity && Icon && <Icon className="tile-icon" aria-hidden="true" />}
            {owner}
          </span>
          <span className="tile-text">
            <span className="tile-name">{isProperty ? v.shortName : v.name}</span>
            {v.value && <span className="tile-value">{v.value}</span>}
          </span>
          <BuildingPips level={v.level} animate={pip ? (pip.hotel ? 'hotel' : 'house') : null} />
        </>
      )}
      {kind === 'row' && (
        <>
          <span className={`tile-bar ${isCity ? 'band-country' : 'band-plain'}`} aria-hidden="true" />
          {/* A built city drops its flag (the colour bar still names the country) to keep the name whole. */}
          {v.level === 0 && flag}
          {Icon && !isCity && <Icon className="tile-icon" aria-hidden="true" />}
          <span className="tile-name">{isProperty ? rowTileName(s, index) : v.name}</span>
          <BuildingPips level={v.level} animate={pip ? (pip.hotel ? 'hotel' : 'house') : null} />
          {v.value && <span className="tile-value">{v.value}</span>}
          {owner}
        </>
      )}
      {v.canBuildNow && (
        <span className="can-build-marker" title={T.tile.canBuild}>
          <Hammer aria-hidden="true" />
        </span>
      )}
      {display.stamp?.space === index && (
        <span key={display.stamp.id} className="stamp" aria-hidden="true">
          {T.tile.bought}
        </span>
      )}
    </button>
  );
}

export const Tile = memo(TileImpl);
