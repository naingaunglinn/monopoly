// Setup: one screen, not a wizard. The defaults start a game in two clicks. Each player's token
// opens a colour palette (D53).
import { ArrowLeft, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SETUP } from '../../data/balance';
import { SEATS } from '../../data/players';
import { DEFAULT_SETTINGS, type Settings } from '../../engine';
import { REDUCED_MOTION_QUERY } from '../animation';
import { Button } from '../components/Button';
import { ColorPicker } from '../components/ColorPicker';
import { ModeFields, RuleToggles, Segmented, Toggle, type GameOptions } from '../components/Fields';
import { useMediaQuery } from '../hooks';
import { setPrefs, usePrefs } from '../prefs';
import { goTo, startNewGame } from '../store';
import { colorName, defaultPlayerName, T, TOKEN_NAMES } from '../strings';

export function SetupScreen() {
  const startRef = useRef<HTMLButtonElement>(null);
  // Start game has focus (Enter starts), without scrolling the form.
  useEffect(() => startRef.current?.focus({ preventScroll: true }), []);
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    playerNames: [...DEFAULT_SETTINGS.playerNames],
    playerColors: [...DEFAULT_SETTINGS.playerColors],
  });
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const prefs = usePrefs();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const setOption = <K extends keyof GameOptions>(key: K, value: GameOptions[K]) => set(key, value as Settings[K]);
  const setName = (seat: number, name: string) =>
    setSettings((s) => ({ ...s, playerNames: s.playerNames.map((n, i) => (i === seat ? name : n)) }));
  // Taking another seat's colour gives that seat yours, so colours stay different.
  const setColor = (seat: number, color: string) =>
    setSettings((s) => {
      const colors = [...s.playerColors];
      const other = colors.indexOf(color);
      if (other >= 0 && other !== seat) colors[other] = colors[seat] as string;
      colors[seat] = color;
      return { ...s, playerColors: colors };
    });
  const shownName = (seat: number) => settings.playerNames[seat]?.trim() || defaultPlayerName(seat);
  const seats = SEATS.slice(0, settings.playerCount);

  return (
    <main className="setup-screen">
      <form
        className="setup-card"
        onSubmit={(e) => {
          e.preventDefault();
          startNewGame(settings);
        }}
      >
        <header className="setup-header">
          <h1 className="setup-title">{T.setup.title}</h1>
        </header>
        <div className="setup-grid">
          <section className="setup-col" aria-label={T.setup.players}>
            <Segmented
              name="players"
              label={T.setup.players}
              value={settings.playerCount}
              options={SETUP.playerCounts}
              onChange={(v) => set('playerCount', v)}
              render={(v) => String(v)}
            />
            <fieldset className="field">
              <legend className="field-label">{T.setup.names}</legend>
              <ol className="name-list">
                {seats.map((seat, i) => {
                  const color = settings.playerColors[i] as string;
                  const holders = Object.fromEntries(
                    seats.flatMap((_, j) => (j === i ? [] : [[settings.playerColors[j] as string, shownName(j)]])),
                  );
                  return (
                    <li key={seat.seat} className="name-row">
                      <ColorPicker
                        seat={i}
                        name={shownName(i)}
                        token={seat.token}
                        color={color}
                        holders={holders}
                        onPick={(c) => setColor(i, c)}
                      />
                      <input
                        className="text-input"
                        aria-label={T.setup.nameLabel(seat.seat)}
                        value={settings.playerNames[i] ?? ''}
                        maxLength={SETUP.maxNameLength}
                        placeholder={defaultPlayerName(i)}
                        onChange={(e) => setName(i, e.target.value)}
                      />
                      <span className="seat-meta">{T.setup.seatColor(colorName(color), TOKEN_NAMES[seat.token])}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="field-hint name-hint">{T.setup.colorHint}</p>
            </fieldset>
          </section>
          <section className="setup-col" aria-label={T.setup.mode}>
            <ModeFields options={settings} onChange={setOption} />
            <Segmented
              name="speed"
              label={T.setup.animation}
              value={settings.animationSpeed}
              options={['normal', 'fast', 'off'] as const}
              onChange={(v) => set('animationSpeed', v)}
              render={(v) => T.setup.speed[v]}
            />
            {reducedMotion && (
              <div className="motion-anyway">
                <Toggle
                  id="opt-motion"
                  label={T.setup.motionAnyway}
                  checked={prefs.motionAnyway}
                  onChange={(v) => setPrefs({ motionAnyway: v })}
                />
                <p className="field-hint">{T.setup.motionHint}</p>
              </div>
            )}
          </section>
          <section className="setup-col" aria-label={T.setup.rules}>
            <RuleToggles options={settings} onChange={setOption}>
              <Toggle id="opt-pass" label={T.setup.passDevice} checked={settings.passDevice} onChange={(v) => set('passDevice', v)} />
            </RuleToggles>
          </section>
        </div>
        <footer className="setup-footer">
          <Button label={T.setup.back} icon={<ArrowLeft size={18} aria-hidden="true" />} onClick={() => goTo('start')} />
          <button type="submit" id="setup-start" className="btn btn-primary" ref={startRef}>
            <Play size={18} aria-hidden="true" />
            <span className="btn-label">{T.setup.start}</span>
          </button>
        </footer>
      </form>
    </main>
  );
}
