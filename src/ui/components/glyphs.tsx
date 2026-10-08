// Original inline SVG for tokens, houses and hotels (spec section 10). Tokens are round chips in
// the player's colour with a white glyph, a white ring and a thin Ink outline.
import type { ReactElement } from 'react';
import type { TokenKind } from '../../data/players';
import { TOKEN_NAMES } from '../strings';

const GLYPHS: Record<TokenKind, ReactElement> = {
  globe: (
    <g fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="5.4" />
      <ellipse cx="12" cy="12" rx="2.3" ry="5.4" />
      <path d="M6.8 10.4h10.4M6.8 13.6h10.4" />
    </g>
  ),
  plane: (
    <path
      fill="#fff"
      d="M12 5.6c.62 0 1.05.5 1.05 1.12v3.7l4.95 2.86v1.52l-4.95-1.5v2.84l1.6 1.2v1.2L12 17.8l-2.65.74v-1.2l1.6-1.2V12.3L6 13.8v-1.52l4.95-2.86v-3.7c0-.62.43-1.12 1.05-1.12z"
    />
  ),
  compass: (
    <g>
      <circle cx="12" cy="12" r="5.6" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path fill="#fff" d="M12 7.2l1.9 4.8L12 16.8 10.1 12z" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </g>
  ),
  crown: (
    <path
      fill="#fff"
      d="M6.4 15.4l-.6-6.5 3.3 2.7L12 7.2l2.9 4.4 3.3-2.7-.6 6.5zM6.6 16.4h10.8v1.6H6.6z"
    />
  ),
  rocket: (
    <g fill="#fff">
      <path d="M12 5.4c2.3 1.5 3.3 3.9 3.3 6.5 0 1.3-.2 2.4-.6 3.4H9.3c-.4-1-.6-2.1-.6-3.4 0-2.6 1-5 3.3-6.5z" />
      <path d="M8.9 12.6l-1.9 2.1v1.9l2.3-1.1zM15.1 12.6l1.9 2.1v1.9l-2.3-1.1zM10.6 16.1h2.8L12 18.7z" />
      <circle cx="12" cy="10.6" r="1.05" fill="currentColor" />
    </g>
  ),
  star: <path fill="#fff" d="M12 5.8l1.85 3.95 4.3.5-3.2 2.95.86 4.27L12 15.3l-3.81 2.17.86-4.27-3.2-2.95 4.3-.5z" />,
};

export function TokenChip({
  token,
  color,
  size = 18,
  title,
  className,
}: {
  token: TokenKind;
  color: string;
  /** px, or any CSS length such as a custom property. */
  size?: number | string;
  title?: string;
  className?: string;
}) {
  const dim = typeof size === 'number' ? `${size}px` : size;
  return (
    <svg
      className={`token-chip ${className ?? ''}`}
      style={{ color, width: dim, height: dim }}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <circle cx="12" cy="12" r="11.6" fill="#14202B" />
      <circle cx="12" cy="12" r="10.9" fill="#fff" />
      <circle cx="12" cy="12" r="9.2" fill={color} />
      {GLYPHS[token]}
    </svg>
  );
}

export function tokenLabel(token: TokenKind): string {
  return TOKEN_NAMES[token];
}

export function HousePip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false" className={`pip pip-house ${className ?? ''}`}>
      <path d="M5 .8l4.2 3.6V9.2H.8V4.4z" fill="#1E9E5A" stroke="#14202B" strokeWidth=".8" strokeLinejoin="round" />
    </svg>
  );
}

export function HotelPip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 15 10" aria-hidden="true" focusable="false" className={`pip pip-hotel ${className ?? ''}`}>
      <path d="M1 3.4L7.5.7 14 3.4v5.8H1z" fill="#D6362B" stroke="#14202B" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M4 5.2h1.6v1.6H4zM6.7 5.2h1.6v1.6H6.7zM9.4 5.2H11v1.6H9.4z" fill="#fff" />
    </svg>
  );
}

/** 1 to 4 house pips or one hotel pip. The newest one can play its build animation. */
export function BuildingPips({ level, animate = null }: { level: number; animate?: 'house' | 'hotel' | null }) {
  if (level <= 0) return null;
  if (level >= 5) {
    return (
      <span className="pips" aria-hidden="true">
        <HotelPip className={animate === 'hotel' ? 'pip-merge' : ''} />
      </span>
    );
  }
  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: level }, (_, i) => (
        <HousePip key={i} className={animate === 'house' && i === level - 1 ? 'pip-new' : ''} />
      ))}
    </span>
  );
}
