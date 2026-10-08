// The Ocean: an SVG graticule, a compass rose and dotted flight arcs in Ocean line (spec section 10).
// On the start screen the arcs trace the game's route: the 16 countries in board order.
import { COUNTRIES } from '../../data/countries';

const W = 1000;
const H = 620;

/** Equirectangular projection of longitude/latitude onto the art's view box. */
function project([lon, lat]: readonly [number, number]): [number, number] {
  return [((lon + 180) / 360) * W, ((80 - lat) / 140) * H];
}

function arc(a: [number, number], b: [number, number]): string {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const lift = Math.min(90, Math.hypot(x2 - x1, y2 - y1) * 0.22);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${(my - lift).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export function OceanArt({ className, routes = false }: { className?: string; routes?: boolean }) {
  const meridians = Array.from({ length: 13 }, (_, i) => i);
  const parallels = Array.from({ length: 7 }, (_, i) => i);
  const points = COUNTRIES.map((c) => ({ id: c.id, color: c.color, xy: project(c.at) }));
  return (
    <svg
      className={`ocean-art ${className ?? ''}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={W} height={H} fill="var(--ocean)" />
      <g fill="none" stroke="var(--ocean-line)" strokeWidth="1.2">
        {meridians.map((i) => {
          const x = (W / 12) * i;
          const bow = (x - W / 2) * 0.12;
          return <path key={`m${i}`} d={`M${x} 0 Q${x + bow} ${H / 2} ${x} ${H}`} />;
        })}
        {parallels.map((i) => {
          const y = (H / 6) * i;
          return <path key={`p${i}`} d={`M0 ${y} Q${W / 2} ${y + (y - H / 2) * 0.1} ${W} ${y}`} />;
        })}
        <path d={`M0 ${(80 / 140) * H} H${W}`} strokeWidth="2.2" />
      </g>
      {routes ? (
        <g>
          <g fill="none" stroke="var(--ocean-line)" strokeWidth="2.4" strokeDasharray="2 8" strokeLinecap="round">
            {points.map((p, i) => {
              const next = points[(i + 1) % points.length] as (typeof points)[number];
              return <path key={p.id} d={arc(p.xy, next.xy)} />;
            })}
          </g>
          {points.map((p) => (
            <circle key={p.id} cx={p.xy[0]} cy={p.xy[1]} r="4.5" fill={p.color} stroke="#fff" strokeWidth="1.6" />
          ))}
        </g>
      ) : (
        <g fill="none" stroke="var(--ocean-line)" strokeWidth="2.2" strokeDasharray="2 9" strokeLinecap="round">
          <path d={`M${W * 0.12} ${H * 0.72} Q${W * 0.3} ${H * 0.18} ${W * 0.52} ${H * 0.4}`} />
          <path d={`M${W * 0.55} ${H * 0.82} Q${W * 0.72} ${H * 0.35} ${W * 0.9} ${H * 0.28}`} />
          <path d={`M${W * 0.2} ${H * 0.2} Q${W * 0.5} ${H * 0.02} ${W * 0.82} ${H * 0.16}`} />
        </g>
      )}
      <g transform={`translate(${W * 0.86} ${H * 0.8})`} stroke="var(--ocean-line)" fill="none" strokeWidth="1.6">
        <circle r="46" />
        <circle r="30" />
        <path d="M0 -62 L8 -8 L0 0 L-8 -8 Z" fill="var(--ocean-line)" />
        <path d="M0 62 L8 8 L0 0 L-8 8 Z" />
        <path d="M62 0 L8 -8 L0 0 L8 8 Z" />
        <path d="M-62 0 L-8 -8 L0 0 L-8 8 Z" />
      </g>
    </svg>
  );
}
