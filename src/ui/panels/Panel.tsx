// Decision panel frame: names whose decision it is and has a small help button that opens the
// rule guide at the matching topic. Mandatory panels have no close button and ignore Esc.
import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Player } from '../../engine';
import { TokenChip } from '../components/glyphs';
import { openRules, ui } from '../store';
import { T, type RuleTopicId } from '../strings';

export function Panel({
  id,
  title,
  whose,
  help,
  children,
  actions,
  className,
  tone,
}: {
  id: string;
  title: ReactNode;
  whose?: Player | null;
  help: RuleTopicId;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  tone?: 'good' | 'bad' | 'neutral' | 'warn';
}) {
  return (
    <section className={`panel ${className ?? ''} ${tone ? `tone-${tone}` : ''}`} aria-labelledby={`${id}-title`} data-panel={id}>
      <header className="panel-head">
        <div className="panel-heading">
          {whose && (
            <span className="panel-whose" style={{ ['--player' as string]: whose.color }}>
              <TokenChip token={whose.token} color={whose.color} size={18} />
              {T.panels.whose(whose.name)}
            </span>
          )}
          <h2 id={`${id}-title`} className="panel-title">
            {title}
          </h2>
        </div>
        <button
          type="button"
          className="icon-btn help-btn"
          onClick={() => openRules(help)}
          aria-label={`${T.panels.help}: ${title}`}
          title={T.panels.help}
        >
          <CircleHelp size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="panel-body">{children}</div>
      {actions && <div className="panel-actions">{actions}</div>}
    </section>
  );
}

/** A small help button that opens a two-line explanation (spec 14, Comfort). */
export function QuickHelpButton({ topic, label }: { topic: 'freeStay' | 'companies' | 'airports' | 'building'; label: string }) {
  return (
    <button
      type="button"
      className="icon-btn quick-help-btn"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        ui.set({ quickHelp: ui.get().quickHelp === topic ? null : topic });
      }}
    >
      <CircleHelp size={15} aria-hidden="true" />
    </button>
  );
}
