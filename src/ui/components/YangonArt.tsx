// The Yangon map's board centre (D116): the Ocean graticule, and over it the city's rivers (Hlaing,
// Yangon, Pazundaung creek, Bago), Inya Lake and Kandawgyi, the 25 townships as dots in their area
// colours and the three pagodas in gold. Drawn from longitude and latitude, in Ocean line.
import { YANGON_CITIES, YANGON_GROUPS, YANGON_TEMPLES } from '../../data/yangon';

const W = 1000;
const H = 620;

/** The part of the globe drawn: Shwepyitha in the north to Dala in the south. */
const WEST = 95.98;
const EAST = 96.34;
const NORTH = 17.05;
const SOUTH = 16.69;
const PAD = 50;
const SCALE = (H - PAD * 2) / (NORTH - SOUTH);

function project([lon, lat]: readonly [number, number]): [number, number] {
  return [W / 2 + (lon - (WEST + EAST) / 2) * SCALE, PAD + (NORTH - lat) * SCALE];
}

/** A smooth line through the points (Catmull-Rom as cubic Béziers). */
function smooth(points: ReadonlyArray<readonly [number, number]>): string {
  const p = points.map(project);
  let d = `M${p[0]![0].toFixed(1)} ${p[0]![1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i]!;
    const b = p[i]!;
    const c = p[i + 1]!;
    const e = p[i + 2] ?? c;
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += ` C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d;
}

/** Water courses as [longitude, latitude], upstream to sea (approximate, for the art only). */
const HLAING: ReadonlyArray<readonly [number, number]> = [
  [96.04, 17.06], [96.07, 16.98], [96.08, 16.92], [96.1, 16.86], [96.12, 16.81], [96.135, 16.78],
];
const YANGON_RIVER: ReadonlyArray<readonly [number, number]> = [
  [96.135, 16.78], [96.155, 16.765], [96.19, 16.765], [96.23, 16.755], [96.27, 16.73], [96.32, 16.7],
];
const PAZUNDAUNG: ReadonlyArray<readonly [number, number]> = [
  [96.25, 16.95], [96.23, 16.88], [96.21, 16.83], [96.195, 16.79], [96.19, 16.766],
];
const BAGO: ReadonlyArray<readonly [number, number]> = [[96.33, 16.86], [96.3, 16.8], [96.26, 16.76], [96.24, 16.752]];

/** Inya Lake and Kandawgyi as ellipses: centre, radii in degrees. */
const LAKES = [
  { at: [96.148, 16.836] as const, rx: 0.008, ry: 0.016 },
  { at: [96.165, 16.792] as const, rx: 0.01, ry: 0.006 },
];

const COLOR = new Map(YANGON_GROUPS.map((g) => [g.id, g.color]));

export function YangonArt({ className }: { className?: string }) {
  const meridians = Array.from({ length: 13 }, (_, i) => i);
  const parallels = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg
      className={`ocean-art river-art ${className ?? ''}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
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
      </g>
      <g fill="none" stroke="var(--river)" strokeLinecap="round" strokeLinejoin="round">
        <path d={smooth(PAZUNDAUNG)} strokeWidth="2" />
        <path d={smooth(BAGO)} strokeWidth="2.4" />
        <path d={smooth(HLAING)} strokeWidth="3" />
        <path d={smooth(YANGON_RIVER)} strokeWidth="4" />
      </g>
      <g fill="none" stroke="var(--river)" strokeWidth="2">
        {LAKES.map((l) => {
          const [x, y] = project(l.at);
          return <ellipse key={l.at.join()} cx={x} cy={y} rx={l.rx * SCALE} ry={l.ry * SCALE} />;
        })}
      </g>
      {Object.values(YANGON_TEMPLES).map((t) => {
        const [x, y] = project(t.at);
        return (
          <path
            key={t.id}
            transform={`translate(${(x - 9).toFixed(1)} ${(y - 15).toFixed(1)}) scale(0.75)`}
            d="M12 2v3m-1.5 4L12 5l1.5 4M8 14a4 5 0 0 1 8 0M6 14h12M5 17.5h14M6 14l-1 3.5L4 21h16l-1-3.5-1-3.5"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {YANGON_CITIES.map((c) => {
        const [x, y] = project(c.at);
        return <circle key={c.space} cx={x} cy={y} r="5.4" fill={COLOR.get(c.country)} stroke="var(--ocean)" strokeWidth="1.6" />;
      })}
    </svg>
  );
}
