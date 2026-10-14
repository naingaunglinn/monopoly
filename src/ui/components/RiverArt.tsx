// The Myanmar map's board centre (D101): the World's Ocean graticule, and over it the country's
// three great rivers (Ayeyarwady, Chindwin, Thanlwin) with the board's 25 cities as dots in their
// region colours and the three pagodas in gold. Drawn from longitude and latitude, in Ocean line.
import { MYANMAR_CITIES, MYANMAR_GROUPS, MYANMAR_TEMPLES } from '../../data/myanmar';

const W = 1000;
const H = 620;

/** The part of the globe drawn: Myanmar from Putao in the north to Kawthaung in the south. */
const WEST = 92;
const EAST = 101.5;
const NORTH = 28.6;
const SOUTH = 9.4;
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

/** River courses as [longitude, latitude], source to sea (approximate, for the art only). */
const AYEYARWADY: ReadonlyArray<readonly [number, number]> = [
  [97.55, 26.2], [97.39, 25.38], [97.24, 24.27], [96.33, 24.17], [96.0, 23.4], [95.95, 22.58], [96.05, 21.97],
  [95.39, 21.46], [94.86, 21.17], [94.93, 20.15], [95.07, 19.32], [95.22, 18.82], [95.46, 17.65], [95.3, 16.9],
  [95.4, 15.85],
];
const PATHEIN_BRANCH: ReadonlyArray<readonly [number, number]> = [[95.46, 17.65], [95.0, 17.2], [94.73, 16.78], [94.35, 15.95]];
const YANGON_RIVER: ReadonlyArray<readonly [number, number]> = [[95.55, 17.4], [95.95, 17.0], [96.2, 16.78], [96.35, 16.45]];
const CHINDWIN: ReadonlyArray<readonly [number, number]> = [
  [96.2, 26.4], [95.7, 25.99], [94.91, 24.87], [94.41, 23.64], [94.3, 23.2], [94.49, 22.87], [95.13, 22.11], [95.39, 21.46],
];
const THANLWIN: ReadonlyArray<readonly [number, number]> = [
  [98.75, 24.4], [98.6, 23.0], [98.15, 22.0], [97.9, 21.0], [97.75, 20.0], [97.85, 18.9], [97.65, 17.8], [97.63, 16.49],
  [97.55, 16.15],
];

const COLOR = new Map(MYANMAR_GROUPS.map((g) => [g.id, g.color]));

export function RiverArt({ className }: { className?: string }) {
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
        <path d={smooth(CHINDWIN)} strokeWidth="2" />
        <path d={smooth(THANLWIN)} strokeWidth="2" />
        <path d={smooth(PATHEIN_BRANCH)} strokeWidth="2" />
        <path d={smooth(YANGON_RIVER)} strokeWidth="2" />
        <path d={smooth(AYEYARWADY)} strokeWidth="3.4" />
      </g>
      {Object.values(MYANMAR_TEMPLES).map((t) => {
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
      {MYANMAR_CITIES.map((c) => {
        const [x, y] = project(c.at);
        return <circle key={c.space} cx={x} cy={y} r="4.6" fill={COLOR.get(c.country)} stroke="var(--ocean)" strokeWidth="1.6" />;
      })}
    </svg>
  );
}
