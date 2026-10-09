// The rule guide (spec section 16): topic list on the left, text on the right, a search box on top.
// It opens over anything, even a mandatory decision, and never changes game state: it only reads
// the settings to say which topics are switched off.
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BALANCE } from '../../data/balance';
import { AIRPORTS, COMPANIES } from '../../data/board';
import { closeRules, useApp, useUi } from '../store';
import { money, RULE_TOPICS, SWITCH_NAMES, T, type RuleTopic, type RuleTopicId } from '../strings';
import { useFocusTrap } from './Overlays';

function tableRows(topic: RuleTopic): Array<[string, string]> {
  switch (topic.table) {
    case 'cityRent':
      return [
        [T.rules.incompleteRow, `${T.rules.baseRent} × 1`],
        ...BALANCE.cityRentMultipliers.map((m, level): [string, string] => [
          level === 0 ? T.focus.completeEmpty : level === 5 ? T.focus.hotel : T.focus.houses(level),
          `${T.rules.baseRent} × ${m}`,
        ]),
      ];
    case 'airportRent':
      // Up to the number of airports on the board.
      return BALANCE.airportRent.slice(0, AIRPORTS.length).map((rent, i): [string, string] => [T.focus.airportsOwned(i + 1), money(rent)]);
    case 'companies':
      return COMPANIES.map((c): [string, string] => [c.name, `${money(c.price)} · ${T.focus.companyFormula(c.multiplier)}`]);
    default:
      return [];
  }
}

function tableHead(topic: RuleTopic): [string, string] {
  if (topic.table === 'airportRent') return [T.rules.tableAirports, T.rules.tableRent];
  if (topic.table === 'companies') return [T.rules.tableCompany, `${T.rules.tablePrice} · ${T.rules.tableRent}`];
  return [T.rules.tableLevel, T.rules.tableRent];
}

function searchText(topic: RuleTopic): string {
  return [topic.title, ...topic.lines, ...tableRows(topic).flat()].join(' ').toLowerCase();
}

export function RuleGuide() {
  const { rules } = useUi();
  const { game, screen } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<RuleTopicId>(rules.topic ?? 'quickStart');
  const ref = useFocusTrap();
  const searchRef = useRef<HTMLInputElement>(null);
  const settings = screen === 'game' ? game?.meta.settings : undefined;

  useEffect(() => {
    if (rules.topic) setActive(rules.topic);
  }, [rules.topic]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRules();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = useMemo(
    () => RULE_TOPICS.filter((t) => words.every((w) => searchText(t).includes(w))),
    [query],
  );
  const topic = visible.find((t) => t.id === active) ?? visible[0] ?? null;
  const off = topic?.switches?.filter((sw) => settings && settings[sw] === false) ?? [];

  return (
    <div className="sheet-backdrop rules-backdrop" data-sheet="rules">
      <div ref={ref} className="sheet rule-guide is-wide" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <header className="sheet-head">
          <h2 id="rules-title" className="sheet-title">
            {T.rules.title}
          </h2>
          <label className="rules-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{T.rules.search}</span>
            <input
              ref={searchRef}
              type="search"
              placeholder={T.rules.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
          <button type="button" className="icon-btn" onClick={closeRules} aria-label={T.rules.close} title={T.rules.close} id="rules-close">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="rules-body">
          <nav className="rules-topics" aria-label={T.rules.topics}>
            <ul>
              {visible.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`rules-topic ${topic?.id === t.id ? 'is-active' : ''}`}
                    aria-current={topic?.id === t.id ? 'true' : undefined}
                    onClick={() => setActive(t.id)}
                  >
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
            {visible.length === 0 && <p className="muted">{T.rules.noMatch}</p>}
          </nav>
          <article className="rules-text" aria-live="polite">
            {topic && (
              <>
                <h3 className="rules-topic-title">{topic.title}</h3>
                {off.length > 0 && (
                  <p className="rules-off">{T.rules.offInGame(off.map((sw) => SWITCH_NAMES[sw]).join(' and '))}</p>
                )}
                {topic.ordered ? (
                  <ol className="rules-lines">
                    {topic.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                ) : (
                  <ul className="rules-lines">
                    {topic.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {topic.table && (
                  <table className="rules-table">
                    {topic.table === 'cityRent' && <caption>{T.rules.cityRentIntro}</caption>}
                    <thead>
                      <tr>
                        <th scope="col">{tableHead(topic)[0]}</th>
                        <th scope="col">{tableHead(topic)[1]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows(topic).map(([a, b]) => (
                        <tr key={a}>
                          <th scope="row">{a}</th>
                          <td className="money">{b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
