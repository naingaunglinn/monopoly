// ?debug=1 only: set the next dice, move a player, add or remove cash, set an owner, set building
// levels and force the next card. Every change goes through the engine's debug actions.
import { Bug, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { BOARD, PROPERTY_SPACES } from '../../data/board';
import { ALL_CARDS, type GameState } from '../../engine';
import { dispatch } from '../store';
import { T } from '../strings';
import { spaceName } from '../view';

export function DebugPanel({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const [d1, setD1] = useState(3);
  const [d2, setD2] = useState(4);
  const [player, setPlayer] = useState(0);
  const [space, setSpace] = useState(1);
  const [delta, setDelta] = useState(500);
  const [propSpace, setPropSpace] = useState(PROPERTY_SPACES[0] ?? 1);
  const [owner, setOwner] = useState<number | null>(0);
  const [level, setLevel] = useState(1);
  const [card, setCard] = useState(ALL_CARDS[0]?.id ?? '');
  const living = s.players.filter((p) => !p.bankrupt);
  const cardDeck = card.startsWith('chance-') ? 'chance' : 'event';
  return (
    <aside className={`debug-panel ${open ? 'is-open' : ''}`} aria-label={T.debug.title}>
      <button type="button" className="debug-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Bug size={16} aria-hidden="true" />
        {T.debug.title}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="debug-body">
          <div className="debug-row">
            <span>{T.debug.nextDice}</span>
            <input type="number" min={1} max={6} value={d1} onChange={(e) => setD1(Number(e.target.value))} aria-label={T.debug.die1} />
            <input type="number" min={1} max={6} value={d2} onChange={(e) => setD2(Number(e.target.value))} aria-label={T.debug.die2} />
            <button type="button" onClick={() => dispatch({ type: 'debug', op: 'setNextDice', dice: [d1, d2] })}>
              {T.debug.set}
            </button>
          </div>
          <div className="debug-row">
            <span>{T.debug.movePlayer}</span>
            <select value={player} onChange={(e) => setPlayer(Number(e.target.value))} aria-label={T.debug.player}>
              {living.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={space} onChange={(e) => setSpace(Number(e.target.value))} aria-label={T.debug.space}>
              {BOARD.map((sp) => (
                <option key={sp.index} value={sp.index}>
                  {sp.index} {spaceName(s, sp.index)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => dispatch({ type: 'debug', op: 'movePlayer', player, space })}>
              {T.debug.set}
            </button>
          </div>
          <div className="debug-row">
            <span>{T.debug.cash}</span>
            <input type="number" step={50} value={delta} onChange={(e) => setDelta(Number(e.target.value))} aria-label={T.debug.cashChange} />
            <button type="button" onClick={() => dispatch({ type: 'debug', op: 'cash', player, delta })}>
              {T.debug.set}
            </button>
          </div>
          <div className="debug-row">
            <span>{T.debug.owner}</span>
            <select value={propSpace} onChange={(e) => setPropSpace(Number(e.target.value))} aria-label={T.debug.space}>
              {PROPERTY_SPACES.map((sp) => (
                <option key={sp} value={sp}>
                  {sp} {spaceName(s, sp)}
                </option>
              ))}
            </select>
            <select
              value={owner === null ? '' : owner}
              onChange={(e) => setOwner(e.target.value === '' ? null : Number(e.target.value))}
              aria-label={T.debug.owner}
            >
              <option value="">{T.debug.nobody}</option>
              {living.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => dispatch({ type: 'debug', op: 'setOwner', space: propSpace, owner })}>
              {T.debug.set}
            </button>
          </div>
          <div className="debug-row">
            <span>{T.debug.level}</span>
            <input type="number" min={0} max={5} value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label={T.debug.level} />
            <button type="button" onClick={() => dispatch({ type: 'debug', op: 'setLevel', space: propSpace, level })}>
              {T.debug.set}
            </button>
          </div>
          <div className="debug-row">
            <span>{T.debug.forceCard}</span>
            <select value={card} onChange={(e) => setCard(e.target.value)} aria-label={T.debug.forceCard}>
              {ALL_CARDS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.deck}: {c.title}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => dispatch({ type: 'debug', op: 'forceCard', deck: cardDeck, cardId: card })}>
              {T.debug.set}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
