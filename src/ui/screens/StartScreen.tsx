// Start screen: the title, the tagline and three buttons. It loads instantly, with no intro.
import { BookOpen, Play, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { BOARD, gridPosition } from '../../data/board';
import { Button } from '../components/Button';
import { OceanArt } from '../components/OceanArt';
import { continueGame, dismissSaveProblem, goTo, openRules, useApp } from '../store';
import { GAME_TITLE, T, TAGLINE } from '../strings';
import { countryOfSpace } from '../view';

/** A small ring drawn from the real board data in country colours. */
function BoardRing() {
  const cell = 7;
  const gap = 1.4;
  return (
    <svg className="start-ring" viewBox={`0 0 ${18 * cell} ${24 * cell}`} aria-hidden="true" focusable="false">
      {BOARD.map((space) => {
        const pos = gridPosition(space.index);
        const country = countryOfSpace(space.index);
        const fill =
          space.type === 'city' && country
            ? country.color
            : space.type === 'airport' || space.type === 'company'
              ? '#D5DCE3'
              : 'rgba(255,255,255,0.9)';
        return (
          <rect
            key={space.index}
            x={pos.col * cell + gap / 2}
            y={pos.row * cell + gap / 2}
            width={cell - gap}
            height={cell - gap}
            rx={1.2}
            fill={fill}
          />
        );
      })}
    </svg>
  );
}

export function StartScreen() {
  const { hasSave, saveProblem } = useApp();
  useEffect(() => {
    document.getElementById('start-new')?.focus();
  }, []);
  return (
    <main className="start-screen">
      <OceanArt />
      <div className="start-content">
        <BoardRing />
        <div className="start-text">
          <h1 className="start-title">{GAME_TITLE}</h1>
          <p className="start-tagline">{TAGLINE}</p>
          <div className="start-buttons">
            <Button
              id="start-new"
              variant="primary"
              label={T.start.newGame}
              icon={<Play size={18} aria-hidden="true" />}
              onClick={() => goTo('setup')}
            />
            <Button
              id="start-continue"
              label={T.start.continue}
              icon={<RotateCcw size={18} aria-hidden="true" />}
              reason={hasSave ? null : T.start.noSave}
              onClick={continueGame}
            />
            <Button
              id="start-rules"
              label={T.start.rules}
              icon={<BookOpen size={18} aria-hidden="true" />}
              onClick={() => openRules('quickStart')}
            />
          </div>
        </div>
      </div>
      {saveProblem && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="save-problem-title">
            <h2 id="save-problem-title" className="dialog-title">
              {T.start.saveProblemTitle}
            </h2>
            <p>{T.start.saveProblem[saveProblem]}</p>
            <div className="dialog-actions">
              <Button
                variant="primary"
                label={T.start.startFresh}
                autoFocus
                onClick={() => {
                  dismissSaveProblem();
                  goTo('setup');
                }}
              />
              <Button label={T.start.back} onClick={dismissSaveProblem} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
