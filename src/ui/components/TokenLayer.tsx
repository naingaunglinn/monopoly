// Tokens stand in the token lane beside their tile, along the inner edge of the ring, so they
// never cover tile text. Several tokens on one space fan out and overlap by at most half.
import { useLayoutEffect, useRef, useState } from 'react';
import { gridPosition } from '../../data/board';
import type { GameState } from '../../engine';
import { shownPosition, useDisplay } from '../display';
import { T, TOKEN_NAMES } from '../strings';
import { TokenChip } from './glyphs';

export const TOKEN_SIZE = 18;
export const CURRENT_TOKEN_SIZE = 24;

/** Centre of a space's slot in the lane, in px inside the ocean box. */
export function laneSlot(index: number, w: number, h: number, laneW: number, laneH: number): { x: number; y: number } {
  const pos = gridPosition(index);
  const left = laneW / 2;
  const right = w - laneW / 2;
  const top = laneH / 2;
  const bottom = h - laneH / 2;
  if (index === 0) return { x: left, y: top };
  if (index === 17) return { x: right, y: top };
  if (index === 40) return { x: right, y: bottom };
  if (index === 57) return { x: left, y: bottom };
  if (pos.side === 'top') return { x: ((pos.col - 0.5) / 16) * w, y: top };
  if (pos.side === 'bottom') return { x: ((pos.col - 0.5) / 16) * w, y: bottom };
  if (pos.side === 'right') return { x: right, y: ((pos.row - 0.5) / 22) * h };
  return { x: left, y: ((pos.row - 0.5) / 22) * h };
}

export function TokenLayer({ s, laneW, laneH }: { s: GameState; laneW: number; laneH: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const display = useDisplay();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const current = s.turn.currentPlayerIndex;
  const living = s.players.filter((p) => !p.bankrupt);
  const bySpace = new Map<number, number[]>();
  for (const p of living) {
    const at = shownPosition(s, display, p.id);
    bySpace.set(at, [...(bySpace.get(at) ?? []), p.id]);
  }

  return (
    <div className="token-layer" ref={ref} aria-hidden="true">
      {box.w > 0 &&
        living.map((p) => {
          const at = shownPosition(s, display, p.id);
          const group = bySpace.get(at) ?? [p.id];
          const slot = laneSlot(at, box.w, box.h, laneW, laneH);
          const i = group.indexOf(p.id);
          const step = TOKEN_SIZE / 2;
          const span = step * (group.length - 1);
          const isCurrent = p.id === current && s.flow.phase !== 'GameOver';
          const size = isCurrent ? CURRENT_TOKEN_SIZE : TOKEN_SIZE;
          const x = slot.x - span / 2 + i * step - size / 2;
          const y = slot.y - size / 2;
          const status = p.inJail ? 'in-jail' : p.skipNextTurn ? 'on-vacation' : '';
          return (
            <div
              key={p.id}
              className={`token ${isCurrent ? 'is-current' : ''} ${status}`}
              data-player={p.id}
              style={{ transform: `translate3d(${x}px, ${y}px, 0)`, zIndex: isCurrent ? 20 : 10 + i }}
              title={`${p.name} (${TOKEN_NAMES[p.token]})${p.inJail ? `, ${T.players.inJail}` : ''}`}
            >
              <TokenChip token={p.token} color={p.color} size={size} />
              {status && <span className={`token-badge badge-${status}`} />}
            </div>
          );
        })}
    </div>
  );
}
