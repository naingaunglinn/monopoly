// The rule guide (spec section 16): topic list on the left, text on the right, a search box on top.
// It opens over anything, even a mandatory decision, and never changes game state: it only reads
// the settings to say which topics are switched off.
import { Languages, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BALANCE, MYANMAR } from '../../data/balance';
import { AIRPORTS, COMPANIES, MAP, RULES } from '../../data/board';
import { setPrefs, usePrefs } from '../prefs';
import { closeRules, useApp, useUi } from '../store';
import { burmeseGuide, money, ruleTopics, RULES_MY, SWITCH_NAMES, T, type RuleTopic, type RuleTopicId } from '../strings';
import { useFocusTrap } from './Overlays';

/** The tables in Burmese (Myanmar map, D114). */
function tableRowsMy(topic: RuleTopic): Array<[string, string]> {
  const W = RULES_MY;
  switch (topic.table) {
    case 'cityRent':
      return [
        [W.incomplete, `${W.baseRent} × ${W.times(1)}`],
        ...BALANCE.cityRentMultipliers.map((m, level): [string, string] => [
          level === 0 ? W.completeEmpty : level === 5 ? W.hotel : W.houses(level),
          `${W.baseRent} × ${W.times(m)}`,
        ]),
      ];
    case 'airportRent':
      return RULES.airportRent.slice(0, AIRPORTS.length).map((rent, i): [string, string] => [W.count(i + 1), money(rent)]);
    case 'companies':
      return (RULES.companyMultipliers ?? []).map((m, i): [string, string] => [W.count(i + 1), W.diceTimes(m)]);
    case 'salary':
      return Array.from({ length: MYANMAR.rankMax }, (_, i): [string, string] => [W.rank(i + 1), money((i + 1) * MYANMAR.salaryPerRank)]);
    default:
      return [];
  }
}

function tableRows(topic: RuleTopic): Array<[string, string]> {
  if (burmeseGuide()) return tableRowsMy(topic);
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
      return RULES.airportRent.slice(0, AIRPORTS.length).map((rent, i): [string, string] => [T.focus.airportsOwned(i + 1), money(rent)]);
    case 'companies':
      // The Myanmar map: one multiplier by how many companies the owner holds (D101).
      if (RULES.companyMultipliers) {
        return RULES.companyMultipliers.map((m, i): [string, string] => [T.players.companies(i + 1), T.focus.companyFormula(m)]);
      }
      return COMPANIES.map((c): [string, string] => [c.name, `${money(c.price)} · ${T.focus.companyFormula(c.multiplier)}`]);
    case 'salary':
      // Myanmar map: the army salary for each rank (D109).
      return Array.from({ length: MYANMAR.rankMax }, (_, i): [string, string] => [T.general.rank(i + 1), money((i + 1) * MYANMAR.salaryPerRank)]);
    default:
      return [];
  }
}

function tableHead(topic: RuleTopic): [string, string] {
  if (burmeseGuide()) {
    const W = RULES_MY;
    if (topic.table === 'airportRent') return [W.tableOwned, W.tableRent];
    if (topic.table === 'companies') return [W.tableCompanies, W.tableRent];
    if (topic.table === 'salary') return [W.tableRank, W.tableSalary];
    return [W.tableLevel, W.tableRent];
  }
  if (topic.table === 'airportRent') return [T.rules.tableAirports, T.rules.tableRent];
  if (topic.table === 'salary') return [T.rules.tableRank, T.rules.tableSalary];
  if (topic.table === 'companies') {
    return RULES.companyMultipliers ? [T.rules.tableCompaniesOwned, T.rules.tableRent] : [T.rules.tableCompany, `${T.rules.tablePrice} · ${T.rules.tableRent}`];
  }
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
  // On the Myanmar map the guide follows this device's language, and can switch it (D114).
  const { language } = usePrefs();
  const my = burmeseGuide();
  const W = my ? RULES_MY : null;

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
  // Worded for the map in play (D101); cheap enough to filter on every render.
  const visible = ruleTopics().filter((t) => words.every((w) => searchText(t).includes(w)));
  const topic = visible.find((t) => t.id === active) ?? visible[0] ?? null;
  const off = topic?.switches?.filter((sw) => settings && settings[sw] === false) ?? [];

  return (
    <div className="sheet-backdrop rules-backdrop" data-sheet="rules">
      <div
        ref={ref}
        className={`sheet rule-guide is-wide ${my ? 'is-burmese' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        lang={my ? 'my' : undefined}
      >
        <header className="sheet-head">
          <h2 id="rules-title" className="sheet-title">
            {W?.title ?? T.rules.title}
          </h2>
          <label className="rules-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{W?.search ?? T.rules.search}</span>
            <input
              ref={searchRef}
              type="search"
              placeholder={W?.search ?? T.rules.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>
          {MAP.id === 'myanmar' && (
            <button
              type="button"
              className="rules-lang"
              id="rules-language"
              onClick={() => setPrefs({ language: language === 'my' ? 'en' : 'my' })}
              aria-label={`${W?.language ?? T.setup.language}: ${T.setup.languages[language === 'my' ? 'en' : 'my']}`}
            >
              <Languages size={16} aria-hidden="true" />
              <span lang={language === 'my' ? 'en' : 'my'}>{T.setup.languages[language === 'my' ? 'en' : 'my']}</span>
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={closeRules}
            aria-label={W?.close ?? T.rules.close}
            title={W?.close ?? T.rules.close}
            id="rules-close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="rules-body">
          <nav className="rules-topics" aria-label={W?.topics ?? T.rules.topics}>
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
            {visible.length === 0 && <p className="muted">{W?.noMatch ?? T.rules.noMatch}</p>}
          </nav>
          <article className="rules-text" aria-live="polite">
            {topic && (
              <>
                <h3 className="rules-topic-title">{topic.title}</h3>
                {off.length > 0 && (
                  <p className="rules-off">
                    {W
                      ? W.offInGame(off.map((sw) => W.switches[sw]).join(' နဲ့ '))
                      : T.rules.offInGame(off.map((sw) => SWITCH_NAMES[sw]).join(' and '))}
                  </p>
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
                    {topic.table === 'cityRent' && <caption>{W?.cityRentIntro ?? T.rules.cityRentIntro}</caption>}
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
