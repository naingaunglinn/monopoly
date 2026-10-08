// Scrolling log, newest at the bottom: one plain sentence per event, a colour dot per player and
// signed money. New lines are announced through an aria-live region.
import { useEffect, useMemo, useRef } from 'react';
import type { GameState } from '../../engine';
import { ui, useUi } from '../store';
import { logPlayer, logText, T } from '../strings';
import { names } from '../view';

export function Log({ s, compact }: { s: GameState; compact: boolean }) {
  const { logExpanded } = useUi();
  const list = useRef<HTMLOListElement>(null);
  const lookup = useMemo(() => names(s), [s]);
  const lines = useMemo(
    () =>
      s.meta.log
        .map((entry) => ({ entry, text: logText(entry.event, lookup), player: logPlayer(entry.event) }))
        .filter((l): l is { entry: typeof l.entry; text: string; player: number | null } => l.text !== null),
    [s.meta.log, lookup],
  );
  const shown = compact && !logExpanded ? lines.slice(-3) : lines;
  const last = lines[lines.length - 1];

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, last?.entry.seq]);

  return (
    <section className={`log ${compact ? 'is-compact' : ''} ${logExpanded ? 'is-expanded' : ''}`} aria-label={T.log.title}>
      <header className="log-head">
        <h2 className="log-title">{T.log.title}</h2>
        {compact && (
          <button type="button" className="link-btn" onClick={() => ui.set({ logExpanded: !logExpanded })} aria-expanded={logExpanded}>
            {logExpanded ? T.log.showLess : T.log.showMore}
          </button>
        )}
      </header>
      <ol className="log-list" ref={list}>
        {shown.length === 0 && <li className="log-line muted">{T.log.empty}</li>}
        {shown.map(({ entry, text, player }) => (
          <li key={entry.seq} className="log-line">
            <span
              className="log-dot"
              style={{ background: player !== null ? s.players[player]?.color : 'var(--ink-soft)' }}
              aria-hidden="true"
            />
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {last?.text ?? ''}
      </div>
    </section>
  );
}
