// Small browser hooks, safe in tests (jsdom has no matchMedia).
import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const update = () => setValue(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [query]);
  return value;
}

/** 1024 to 1279 px: compact log (last 3 lines, expands on click). */
export const COMPACT_QUERY = '(max-width: 1279px)';
/** Under 1024 px or portrait: the HUD moves below the board. */
export const STACKED_QUERY = '(max-width: 1023px), (orientation: portrait)';
