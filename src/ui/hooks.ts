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
/**
 * Phones and other small screens (spec section 17): under 1024 px wide, portrait, or under 540 px
 * tall (phones in landscape). The board becomes a zoomable viewport with a control sheet.
 */
export const PHONE_QUERY = '(max-width: 1023px), (orientation: portrait), (max-height: 539px)';
