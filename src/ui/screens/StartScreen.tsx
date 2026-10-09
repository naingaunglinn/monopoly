// Start screen: the title, the tagline, and two ways to play: on this device (New game, Continue)
// or online (Create room, Join room, and Rejoin room when this browser holds a seat in a live room).
// It loads instantly, with no intro; it asks the server nothing unless a room is stored.
import { BookOpen, LogIn, Play, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BOARD, GRID_COLUMNS, GRID_ROWS, gridPosition } from '../../data/board';
import { Button } from '../components/Button';
import { OceanArt } from '../components/OceanArt';
import { probeRejoin, rejoin, showCreate, showJoin } from '../session/online';
import { continueGame, dismissSaveProblem, goTo, openRules, showToast, useApp } from '../store';
import { GAME_TITLE, T, TAGLINE } from '../strings';
import { countryOfSpace } from '../view';

/** A small ring drawn from the real board data in country colours. */
function BoardRing() {
  const cell = 7;
  const gap = 1.4;
  return (
    <svg className="start-ring" viewBox={`0 0 ${GRID_COLUMNS * cell} ${GRID_ROWS * cell}`} aria-hidden="true" focusable="false">
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
  const [rejoinCode, setRejoinCode] = useState<string | null>(null);
  useEffect(() => {
    document.getElementById('start-new')?.focus();
    let alive = true;
    void probeRejoin().then((code) => alive && setRejoinCode(code));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <main className="start-screen">
      <OceanArt routes />
      <div className="start-content">
        <BoardRing />
        <div className="start-text">
          <h1 className="start-title">{GAME_TITLE}</h1>
          <p className="start-tagline">{TAGLINE}</p>
          <div className="start-groups">
            <section className="start-group" aria-labelledby="start-local">
              <h2 id="start-local" className="start-group-label">
                {T.online.thisDevice}
              </h2>
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
              </div>
            </section>
            <section className="start-group" aria-labelledby="start-online">
              <h2 id="start-online" className="start-group-label">
                {T.online.playOnline}
              </h2>
              <div className="start-buttons">
                <Button id="start-create" label={T.online.create} icon={<Plus size={18} aria-hidden="true" />} onClick={showCreate} />
                <Button id="start-join" label={T.online.join} icon={<LogIn size={18} aria-hidden="true" />} onClick={() => showJoin()} />
                {rejoinCode && (
                  <Button
                    id="start-rejoin"
                    label={T.online.rejoin(rejoinCode)}
                    icon={<Undo2 size={18} aria-hidden="true" />}
                    onClick={() =>
                      void rejoin().then((ok) => {
                        if (!ok) {
                          setRejoinCode(null);
                          showToast(T.online.errors.notInRoom ?? '');
                        }
                      })
                    }
                  />
                )}
              </div>
            </section>
            <div className="start-buttons start-rules">
              <Button
                id="start-rules"
                label={T.start.rules}
                icon={<BookOpen size={18} aria-hidden="true" />}
                onClick={() => openRules('quickStart')}
              />
            </div>
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
