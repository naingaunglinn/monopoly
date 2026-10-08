// Short effects drawn over the HUD: a coin travelling from payer to owner (rent) and one confetti
// burst for the winner. Transform and opacity only; both disappear on any click.
import { useLayoutEffect, useRef, useState } from 'react';
import { useDisplay } from '../display';

/** Moves a coin from one player card to another. */
export function CoinFlight() {
  const { coin } = useDisplay();
  const ref = useRef<HTMLSpanElement>(null);
  const [path, setPath] = useState<{ x0: number; y0: number; dx: number; dy: number } | null>(null);
  useLayoutEffect(() => {
    if (!coin) {
      setPath(null);
      return;
    }
    const host = ref.current?.parentElement;
    const from = document.querySelector(`.player-card[data-player="${coin.from}"]`);
    const to = document.querySelector(`.player-card[data-player="${coin.to}"]`);
    if (!host || !from || !to) return;
    const h = host.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x0 = a.right - h.left - 28;
    const y0 = a.top - h.top + a.height / 2 - 10;
    setPath({ x0, y0, dx: b.right - h.left - 28 - x0, dy: b.top - h.top + b.height / 2 - 10 - y0 });
  }, [coin]);
  return (
    <span className="coin-layer" aria-hidden="true">
      <span ref={ref} />
      {coin && path && (
        <span
          key={coin.id}
          className="coin"
          style={{
            ['--x0' as string]: `${path.x0}px`,
            ['--y0' as string]: `${path.y0}px`,
            ['--dx' as string]: `${path.dx}px`,
            ['--dy' as string]: `${path.dy}px`,
          }}
        >
          $
        </span>
      )}
    </span>
  );
}

const CONFETTI_COLORS = ['#E5484D', '#3E63DD', '#30A46C', '#F76B15', '#8E4EC6', '#0E9C9C', '#FFFFFF'];

export function Confetti() {
  const { confetti } = useDisplay();
  if (confetti === null) return null;
  return (
    <div className="confetti" aria-hidden="true" key={confetti}>
      {Array.from({ length: 70 }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 10) * 45;
        const drift = ((i * 53) % 120) - 60;
        const spin = ((i * 97) % 540) - 270;
        return (
          <span
            key={i}
            className="confetti-bit"
            style={{
              left: `${left}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${delay}ms`,
              ['--drift' as string]: `${drift}px`,
              ['--spin' as string]: `${spin}deg`,
            }}
          />
        );
      })}
    </div>
  );
}
