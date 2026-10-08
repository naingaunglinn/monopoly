// Setup: one screen, not a wizard. The defaults start a game in two clicks.
import { ArrowLeft, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SETUP } from '../../data/balance';
import { SEATS } from '../../data/players';
import { DEFAULT_SETTINGS, type Settings } from '../../engine';
import { Button } from '../components/Button';
import { TokenChip } from '../components/glyphs';
import { goTo, startNewGame } from '../store';
import { defaultPlayerName, money, T, TOKEN_NAMES } from '../strings';

function Segmented<V extends string | number>({
  label,
  value,
  options,
  onChange,
  render,
  name,
}: {
  label: string;
  value: V;
  options: readonly V[];
  onChange: (v: V) => void;
  render: (v: V) => string;
  name: string;
}) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <label key={String(opt)} className={`segment ${opt === value ? 'is-on' : ''}`}>
            <input
              type="radio"
              name={name}
              value={String(opt)}
              checked={opt === value}
              onChange={() => onChange(opt)}
            />
            <span>{render(opt)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
      <span className="toggle-state" aria-hidden="true">
        {checked ? T.setup.on : T.setup.off}
      </span>
    </label>
  );
}

export function SetupScreen() {
  const startRef = useRef<HTMLButtonElement>(null);
  // Start game has focus (Enter starts), without scrolling the form.
  useEffect(() => startRef.current?.focus({ preventScroll: true }), []);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, playerNames: [...DEFAULT_SETTINGS.playerNames] });
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const setName = (seat: number, name: string) =>
    setSettings((s) => ({ ...s, playerNames: s.playerNames.map((n, i) => (i === seat ? name : n)) }));

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
                {SEATS.slice(0, settings.playerCount).map((seat, i) => (
                  <li key={seat.seat} className="name-row">
                    <TokenChip token={seat.token} color={seat.color} size={26} />
                    <input
                      className="text-input"
                      aria-label={T.setup.nameLabel(seat.seat)}
                      value={settings.playerNames[i] ?? ''}
                      maxLength={SETUP.maxNameLength}
                      placeholder={defaultPlayerName(i)}
                      onChange={(e) => setName(i, e.target.value)}
                    />
                    <span className="seat-meta">{T.setup.seatColor(seat.colorName, TOKEN_NAMES[seat.token])}</span>
                  </li>
                ))}
              </ol>
            </fieldset>
          </section>
          <section className="setup-col" aria-label={T.setup.mode}>
            <Segmented
              name="money"
              label={T.setup.startingMoney}
              value={settings.startingMoney}
              options={SETUP.startingMoney}
              onChange={(v) => set('startingMoney', v)}
              render={(v) => money(v)}
            />
            <Segmented
              name="mode"
              label={T.setup.mode}
              value={settings.mode}
              options={['quick', 'normal'] as const}
              onChange={(v) => set('mode', v)}
              render={(v) => (v === 'quick' ? T.setup.quick : T.setup.normal)}
            />
            <p className="field-hint">{settings.mode === 'quick' ? T.setup.quickHint : T.setup.normalHint}</p>
            {settings.mode === 'quick' && (
              <Segmented
                name="rounds"
                label={T.setup.roundLimit}
                value={settings.roundLimit}
                options={SETUP.roundLimits}
                onChange={(v) => set('roundLimit', v)}
                render={(v) => T.setup.rounds(v)}
              />
            )}
            <Segmented
              name="speed"
              label={T.setup.animation}
              value={settings.animationSpeed}
              options={['normal', 'fast', 'off'] as const}
              onChange={(v) => set('animationSpeed', v)}
              render={(v) => T.setup.speed[v]}
            />
          </section>
          <section className="setup-col" aria-label={T.setup.rules}>
            <fieldset className="field">
              <legend className="field-label">{T.setup.rules}</legend>
              <div className="toggle-list">
                <Toggle id="opt-freestay" label={T.setup.freeStay} checked={settings.freeStay} onChange={(v) => set('freeStay', v)} />
                <Toggle id="opt-vacation" label={T.setup.vacation} checked={settings.vacation} onChange={(v) => set('vacation', v)} />
                <Toggle id="opt-auction" label={T.setup.auction} checked={settings.auction} onChange={(v) => set('auction', v)} />
                <Toggle id="opt-chance" label={T.setup.chance} checked={settings.chance} onChange={(v) => set('chance', v)} />
                <Toggle id="opt-event" label={T.setup.event} checked={settings.event} onChange={(v) => set('event', v)} />
                <Toggle
                  id="opt-random-first"
                  label={T.setup.randomFirst}
                  checked={settings.randomFirstPlayer}
                  onChange={(v) => set('randomFirstPlayer', v)}
                />
                <Toggle id="opt-pass" label={T.setup.passDevice} checked={settings.passDevice} onChange={(v) => set('passDevice', v)} />
              </div>
            </fieldset>
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
