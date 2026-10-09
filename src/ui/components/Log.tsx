// Scrolling log, newest at the bottom: one plain sentence per event, a colour dot per player and
// signed money. New lines are announced through an aria-live region. While the board plays the
// last action, its lines wait until the animation ends, so the log never tells the outcome early.
import { useEffect, useMemo, useRef } from 'react';
import type { GameState } from '../../engine';
import { useDisplay } from '../display';
import { ui, useUi } from '../store';
import { logPlayer, logText, T } from '../strings';
import { names } from '../view';

/** The log box on one device: its title, Show more when compact, and the lines. */
export function Log({ s, compact }: { s: GameState; compact: boolean }) {
  const { logExpanded } = useUi();
  return (
    <section className={`log ${compact ? 'is-compact' : ''} ${logExpanded ? 'is-expanded' : ''}`} aria-label={T.log.title}>
      <header className="log-head">
        <h2 className="log-title">{T.log.title}</h2>
        {compact && <LogMoreButton />}
      </header>
      <LogLines s={s} compact={compact} />
    </section>
  );
}

export function LogMoreButton() {
  const { logExpanded } = useUi();
  return (
    <button type="button" className="link-btn" onClick={() => ui.set({ logExpanded: !logExpanded })} aria-expanded={logExpanded}>
      {logExpanded ? T.log.showLess : T.log.showMore}
    </button>
  );
}

/** The lines of the log (the last three when compact and not expanded), newest at the bottom. */
export function LogLines({ s, compact }: { s: GameState; compact: boolean }) {
  const { logExpanded } = useUi();
  const { busy, logUntil } = useDisplay();
  const until = busy && logUntil !== null ? logUntil : Infinity;
  const list = useRef<HTMLOListElement>(null);
  const lookup = useMemo(() => names(s), [s]);
  const lines = useMemo(
    () =>
      s.meta.log
        .filter((entry) => entry.seq <= until)
        .map((entry) => ({ entry, text: logText(entry.event, lookup), player: logPlayer(entry.event) }))
        .filter((l): l is { entry: typeof l.entry; text: string; player: number | null } => l.text !== null),
    [s.meta.log, lookup, until],
  );
  const shown = compact && !logExpanded ? lines.slice(-3) : lines;
  const last = lines[lines.length - 1];

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, last?.entry.seq]);

  return (
    <>
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
    </>
  );
}
