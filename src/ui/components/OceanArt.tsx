// The Ocean: an SVG graticule, a compass rose and a few dotted flight arcs in Ocean line
// (spec section 10). Decorative only.
export function OceanArt({ className }: { className?: string }) {
  const W = 1000;
  const H = 620;
  const meridians = Array.from({ length: 13 }, (_, i) => i);
  const parallels = Array.from({ length: 7 }, (_, i) => i);
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
          // Meridians bow outward like a map projection.
          const x = (W / 12) * i;
          const bow = (x - W / 2) * 0.12;
          return <path key={`m${i}`} d={`M${x} 0 Q${x + bow} ${H / 2} ${x} ${H}`} />;
        })}
        {parallels.map((i) => {
          const y = (H / 6) * i;
          return <path key={`p${i}`} d={`M0 ${y} Q${W / 2} ${y + (y - H / 2) * 0.1} ${W} ${y}`} />;
        })}
        <path d={`M0 ${H / 2} H${W}`} strokeWidth="2" />
      </g>
      <g fill="none" stroke="var(--ocean-line)" strokeWidth="2.2" strokeDasharray="2 9" strokeLinecap="round">
        <path d={`M${W * 0.12} ${H * 0.72} Q${W * 0.3} ${H * 0.18} ${W * 0.52} ${H * 0.4}`} />
        <path d={`M${W * 0.55} ${H * 0.82} Q${W * 0.72} ${H * 0.35} ${W * 0.9} ${H * 0.28}`} />
        <path d={`M${W * 0.2} ${H * 0.2} Q${W * 0.5} ${H * 0.02} ${W * 0.82} ${H * 0.16}`} />
      </g>
      <g transform={`translate(${W * 0.86} ${H * 0.78})`} stroke="var(--ocean-line)" fill="none" strokeWidth="1.6">
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
