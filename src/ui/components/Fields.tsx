// Form fields shared by the local setup screen and the online lobby: segmented choices, switches,
// and the game options of spec section 8 (starting money, mode, round limit, house rules).
import type { ReactNode } from 'react';
import { SETUP } from '../../data/balance';
import type { Settings } from '../../engine';
import { money, T } from '../strings';

export function Segmented<V extends string | number>({
  label,
  value,
  options,
  onChange,
  render,
  name,
  disabled = false,
}: {
  label: string;
  value: V;
  options: readonly V[];
  onChange: (v: V) => void;
  render: (v: V) => string;
  name: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="field" disabled={disabled}>
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

export function Toggle({
  label,
  checked,
  onChange,
  id,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle ${disabled ? 'is-disabled' : ''}`} htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
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

export type GameOptions = Pick<
  Settings,
  'startingMoney' | 'mode' | 'roundLimit' | 'freeStay' | 'vacation' | 'auction' | 'chance' | 'event' | 'randomFirstPlayer'
>;

type Change = <K extends keyof GameOptions>(key: K, value: GameOptions[K]) => void;

/** Starting money, game mode (with its one-line explanation) and the Quick round limit. */
export function ModeFields({ options, onChange, disabled = false }: { options: GameOptions; onChange: Change; disabled?: boolean }) {
  // A test round limit (?rounds=5) is shown as chosen, alongside the usual three.
  const limits = SETUP.roundLimits.includes(options.roundLimit) ? SETUP.roundLimits : [...SETUP.roundLimits, options.roundLimit];
  return (
    <>
      <Segmented
        name="money"
        label={T.setup.startingMoney}
        value={options.startingMoney}
        options={SETUP.startingMoney}
        onChange={(v) => onChange('startingMoney', v)}
        render={(v) => money(v)}
        disabled={disabled}
      />
      <Segmented
        name="mode"
        label={T.setup.mode}
        value={options.mode}
        options={['quick', 'normal'] as const}
        onChange={(v) => onChange('mode', v)}
        render={(v) => (v === 'quick' ? T.setup.quick : T.setup.normal)}
        disabled={disabled}
      />
      <p className="field-hint">{options.mode === 'quick' ? T.setup.quickHint : T.setup.normalHint}</p>
      {options.mode === 'quick' && (
        <Segmented
          name="rounds"
          label={T.setup.roundLimit}
          value={options.roundLimit}
          options={limits}
          onChange={(v) => onChange('roundLimit', v)}
          render={(v) => T.setup.rounds(v)}
          disabled={disabled}
        />
      )}
    </>
  );
}

/** The house rules (spec section 8); extra switches (Pass-device screen) go in `children`. */
export function RuleToggles({
  options,
  onChange,
  disabled = false,
  children,
}: {
  options: GameOptions;
  onChange: Change;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <fieldset className="field">
      <legend className="field-label">{T.setup.rules}</legend>
      <div className="toggle-list">
        <Toggle id="opt-freestay" label={T.setup.freeStay} checked={options.freeStay} onChange={(v) => onChange('freeStay', v)} disabled={disabled} />
        <Toggle id="opt-vacation" label={T.setup.vacation} checked={options.vacation} onChange={(v) => onChange('vacation', v)} disabled={disabled} />
        <Toggle id="opt-auction" label={T.setup.auction} checked={options.auction} onChange={(v) => onChange('auction', v)} disabled={disabled} />
        <Toggle id="opt-chance" label={T.setup.chance} checked={options.chance} onChange={(v) => onChange('chance', v)} disabled={disabled} />
        <Toggle id="opt-event" label={T.setup.event} checked={options.event} onChange={(v) => onChange('event', v)} disabled={disabled} />
        <Toggle
          id="opt-random-first"
          label={T.setup.randomFirst}
          checked={options.randomFirstPlayer}
          onChange={(v) => onChange('randomFirstPlayer', v)}
          disabled={disabled}
        />
        {children}
      </div>
    </fieldset>
  );
}
