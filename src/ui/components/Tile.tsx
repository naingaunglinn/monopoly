// One board tile. Compact by design: the Focus Card shows the details at full size.
import { Hammer } from 'lucide-react';
import { memo, type KeyboardEvent } from 'react';
import { gridPosition } from '../../data/board';
import type { GameState } from '../../engine';
import { ui } from '../store';
import { T } from '../strings';
import { isRestSpace, tileView } from '../view';
import { Flag } from './Flag';
import { BuildingPips, TokenChip } from './glyphs';
import { spaceIcon } from './icons';

export type TileKind = 'corner' | 'card' | 'row';

export function tileKind(index: number): TileKind {
  const pos = gridPosition(index);
  if (pos.corner) return 'corner';
  return pos.side === 'top' || pos.side === 'bottom' ? 'card' : 'row';
}

interface TileProps {
  s: GameState;
  index: number;
  isCurrent: boolean;
  focusable: boolean;
  onNavigate: (from: number, delta: number) => void;
}

function describe(s: GameState, index: number): string {
  const v = tileView(s, index);
  const parts = [v.name];
  if (v.country && v.space.type === 'city') parts.push(v.country.name);
  if (v.owner) parts.push(T.tile.owner(v.owner.name));
  if (v.value) parts.push(v.value);
  if (v.level > 0) parts.push(T.tile.level(v.level));
  if (v.canBuildNow) parts.push(T.tile.canBuild);
  return parts.join(', ');
}

function TileImpl({ s, index, isCurrent, focusable, onNavigate }: TileProps) {
  const v = tileView(s, index);
  const pos = gridPosition(index);
  const kind = tileKind(index);
  const rest = isRestSpace(s, index);
  const Icon = spaceIcon(v.space, rest);
  const isCity = v.space.type === 'city';
  const isProperty = isCity || v.space.type === 'airport' || v.space.type === 'company';
  const band = isCity && v.country ? v.country.color : undefined;
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
    <TokenChip className="owner-marker" token={v.owner.token} color={v.owner.color} size={kind === 'row' ? 13 : 14} />
  ) : null;
  const flag = v.country ? <Flag code={v.country.flag} width={kind === 'row' ? 14 : 16} /> : null;
  const classes = [
    'tile',
    `tile-${kind}`,
    `side-${pos.side}`,
    `type-${v.space.type}`,
    isCurrent ? 'is-current' : '',
    v.mortgaged ? 'is-mortgaged' : '',
    v.owner ? 'is-owned' : '',
    v.canBuildNow ? 'can-build' : '',
    rest ? 'is-rest' : '',
  ].join(' ');

  return (
    <button
      type="button"
      className={classes}
      data-space={index}
      style={{ gridColumn: pos.col + 1, gridRow: pos.row + 1, ['--band' as string]: band }}
      tabIndex={focusable ? 0 : -1}
      aria-label={describe(s, index)}
      onMouseEnter={() => ui.set({ hover: index })}
      onMouseLeave={() => ui.get().hover === index && ui.set({ hover: null })}
      onFocus={() => ui.set({ hover: index })}
      onBlur={() => ui.get().hover === index && ui.set({ hover: null })}
      onClick={() => ui.set({ pinned: ui.get().pinned === index ? null : index })}
      onKeyDown={onKey}
    >
      {kind === 'corner' && (
        <span className="tile-corner-body">
          {Icon && <Icon className="tile-icon" size={22} aria-hidden="true" />}
          <span className="tile-name">{v.name}</span>
        </span>
      )}
      {kind === 'card' && (
        <>
          <span className={`tile-band ${isCity ? 'band-country' : 'band-plain'}`}>
            {flag}
            {!isCity && Icon && <Icon className="tile-icon" size={14} aria-hidden="true" />}
            {owner}
          </span>
          <span className="tile-name">{isProperty ? v.shortName : v.name}</span>
          {v.value && <span className="tile-value">{v.value}</span>}
          <BuildingPips level={v.level} size={8} />
        </>
      )}
      {kind === 'row' && (
        <>
          <span className={`tile-bar ${isCity ? 'band-country' : 'band-plain'}`} aria-hidden="true" />
          {flag ?? (Icon && <Icon className="tile-icon" size={13} aria-hidden="true" />)}
          <span className="tile-name">{isProperty ? v.shortName : v.name}</span>
          <BuildingPips level={v.level} size={8} />
          {v.value && <span className="tile-value">{v.value}</span>}
          {owner}
        </>
      )}
      {v.canBuildNow && (
        <span className="can-build-marker" title={T.tile.canBuild}>
          <Hammer size={11} aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

export const Tile = memo(TileImpl);
