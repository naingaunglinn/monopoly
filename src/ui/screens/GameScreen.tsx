// The game screen: a slim top bar and the board ring filling the rest, every control inside the
// ring (spec section 11). Under 1024 px or in portrait the HUD moves below the board.
import { ArrowLeftRight, BookOpen, FastForward, Hammer, Layers, Menu as MenuIcon, Plus, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARD } from '../../data/board';
import { freeActor, validateAction, type GameState, type Player } from '../../engine';
import { finishNow } from '../animation';
import { Button, useShake } from '../components/Button';
import { DicePanel } from '../components/Dice';
import { CoinFlight, Confetti } from '../components/Effects';
import { FocusCard } from '../components/FocusCard';
import { TokenChip } from '../components/glyphs';
import { Log } from '../components/Log';
import { OceanArt } from '../components/OceanArt';
import { PlayersColumn } from '../components/PlayersColumn';
import { Tile } from '../components/Tile';
import { TokenLayer } from '../components/TokenLayer';
import { shownCash, shownDice, shownPosition, useDisplay } from '../display';
import { COMPACT_QUERY, STACKED_QUERY, useMediaQuery } from '../hooks';
import {
  ConfirmDialog,
  PassDevice,
  PropertyList,
  QuickHelpPopover,
  Results,
  SettingsFields,
  Toast,
  TradeBuilder,
  TradeResponse,
} from '../overlays/Overlays';
import { DebugPanel } from '../overlays/DebugPanel';
import { ActivePanel } from '../panels/DecisionPanels';
import {
  app,
  askConfirm,
  closeConfirm,
  closeRules,
  closeSheet,
  DEBUG,
  dispatch,
  openRules,
  openSheet,
  refuse,
  saveNow,
  showToast,
  ui,
  useAnimationSpeed,
  useApp,
  useGame,
  useUi,
} from '../store';
import { GAME_TITLE, modifierLabel, money, recapLine, T } from '../strings';
import { legalTypes, names, playerName, primarySpec } from '../view';

function TopBar({ s }: { s: GameState }) {
  const { menuOpen } = useUi();
  const display = useDisplay();
  const current = s.players[s.turn.currentPlayerIndex] as Player;
  const quick = s.meta.settings.mode === 'quick';
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) ui.set({ menuOpen: false });
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);
  return (
    <header className="topbar">
      <span className="tb-title">{GAME_TITLE}</span>
      <span className="tb-stat">
        {quick ? T.top.roundOf(s.turn.roundNumber, s.meta.settings.roundLimit) : T.top.round(s.turn.roundNumber)}
      </span>
      <span className="tb-stat">{T.top.turn(s.turn.turnNumber)}</span>
      {s.flow.phase !== 'GameOver' && (
        <span className="tb-player" style={{ ['--player' as string]: current.color }}>
          <TokenChip token={current.token} color={current.color} size={22} />
          <span className="tb-player-name">{current.name}</span>
          <span className="tb-cash money">{money(shownCash(s, display, current.id))}</span>
        </span>
      )}
      <ul className="tb-modifiers" aria-label={T.top.modifiersLabel}>
        {s.flow.modifiers.map((m) => (
          <li key={m.type} className={`chip ${m.factor > 1 ? 'chip-up' : 'chip-down'}`} title={T.top.until(playerName(s, m.drawnBy))}>
            <Layers size={13} aria-hidden="true" />
            {modifierLabel(m.type, m.factor)}
          </li>
        ))}
      </ul>
      <span className="tb-spacer" />
      <Button
        id="tb-rules"
        variant="ghost"
        label={T.top.rules}
        keyHint="R"
        icon={<BookOpen size={16} aria-hidden="true" />}
        onClick={() => openRules()}
      />
      <div className="menu-wrap" ref={menuRef}>
        <button
          type="button"
          id="tb-menu"
          className="btn btn-ghost"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => ui.set({ menuOpen: !menuOpen })}
        >
          <MenuIcon size={16} aria-hidden="true" />
          <span className="btn-label">{T.top.menu}</span>
        </button>
        {menuOpen && (
          <div className="menu" role="dialog" aria-label={T.top.menu}>
            <SettingsFields s={s} />
            <div className="menu-sep" />
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                ui.set({ menuOpen: false });
                showToast(saveNow() ? T.top.saved : T.top.saveFailed);
              }}
            >
              <Save size={16} aria-hidden="true" />
              {T.top.save}
            </button>
            <button type="button" className="menu-item" onClick={() => askConfirm({ kind: 'newGame' })}>
              <Plus size={16} aria-hidden="true" />
              {T.top.newGame}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function PrimaryButton({ s }: { s: GameState }) {
  const spec = primarySpec(s);
  const shaking = useShake('primary');
  const { busy } = useDisplay();
  if (!spec) return <div className="primary-slot" />;
  // While the board plays the last action the button offers to skip it, so an eager press is not
  // mistaken for the next step (any press or key skips; D51). It becomes the next step after.
  if (busy) {
    return (
      <div className="primary-slot">
        <button type="button" id="primary" className="btn btn-big btn-skip" aria-keyshortcuts="Space Enter" onClick={() => finishNow()}>
          <FastForward size={18} aria-hidden="true" />
          <span className="btn-label">{T.play.skip}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="primary-slot">
      <button
        type="button"
        id="primary"
        className={`btn btn-primary btn-big ${shaking ? 'shake' : ''}`}
        aria-disabled={spec.reason ? true : undefined}
        aria-describedby={spec.reason ? 'primary-reason' : undefined}
        title={spec.reason ?? undefined}
        aria-keyshortcuts="Space Enter"
        onClick={(e) => {
          if (e.detail > 0) e.currentTarget.blur();
          if (spec.reason) refuse(spec.reason, 'primary');
          else dispatch(spec.action, 'primary');
        }}
      >
        <span className="btn-label">{spec.label}</span>
      </button>
      {spec.reason && (
        <span id="primary-reason" className="primary-reason">
          {spec.reason}
        </span>
      )}
    </div>
  );
}

function RefusalLine() {
  const { refusal } = useApp();
  if (!refusal) return null;
  return (
    <p className="refusal" role="alert">
      {refusal.reason}
    </p>
  );
}

function ActionBar({ s }: { s: GameState }) {
  const types = legalTypes(s);
  const actor = freeActor(s);
  const owner = actor ?? s.turn.currentPlayerIndex;
  return (
    <div className="action-bar">
      <PrimaryButton s={s} />
      <div className="secondary-actions">
        {types.has('openBuild') && (
          <Button id="act-build" label={T.play.build} icon={<Hammer size={16} aria-hidden="true" />} action={{ type: 'openBuild' }} />
        )}
        {types.has('proposeTrade') && s.flow.phase !== 'Debt' && (
          <Button
            id="act-trade"
            label={T.play.trade}
            keyHint="T"
            icon={<ArrowLeftRight size={16} aria-hidden="true" />}
            onClick={() => openSheet({ kind: 'trade' })}
          />
        )}
        {s.flow.phase !== 'GameOver' && (
          <Button id="act-props" label={T.play.myProperties} onClick={() => openSheet({ kind: 'properties', player: owner })} />
        )}
      </div>
      <RefusalLine />
    </div>
  );
}

function Stage({ s, compactLog }: { s: GameState; compactLog: boolean }) {
  const display = useDisplay();
  const pending = s.flow.notices.length > 0 || !['PassDevice', 'AwaitRoll', 'AwaitEndTurn'].includes(s.flow.phase);
  const showPanel = pending && !display.busy;
  const position = shownPosition(s, display, s.turn.currentPlayerIndex);
  const dice = shownDice(s, display);
  const lastRoll = [...s.meta.log].reverse().find((e) => e.event.type === 'diceRolled');
  const thirdDouble = s.turn.doublesCount >= 3 && !!s.players[s.turn.currentPlayerIndex]?.inJail;
  const moveLine =
    dice && lastRoll?.event.type === 'diceRolled' && lastRoll.event.purpose === 'move'
      ? thirdDouble
        ? T.play.thirdDouble
        : T.play.move(dice[0] + dice[1])
      : null;
  const showRecap = s.turn.dice === null && s.flow.phase !== 'GameOver';
  const doublesAgain =
    s.turn.rollsLeft > 0 && !!s.turn.dice && s.turn.dice[0] === s.turn.dice[1] && s.flow.phase === 'AwaitRoll' && !display.busy;
  return (
    <div className={`stage ${showPanel ? 'has-panel' : ''} ${compactLog ? 'is-compact' : ''}`}>
      <div className="stage-main">
        <FocusCard s={s} fallback={position} />
        <div className="stage-side">
          <DicePanel dice={dice} line={moveLine} rolling={display.rolling} />
          {doublesAgain && <p className="hint-line">{T.play.doubles}</p>}
          {showRecap && <p className="recap-line">{recapLine(s.turn.recap, names(s))}</p>}
        </div>
      </div>
      <Log s={s} compact={compactLog} />
      {showPanel && (
        <div className="panel-layer">
          <ActivePanel s={s} />
        </div>
      )}
      <ActionBar s={s} />
    </div>
  );
}

function Hud({ s, compactLog }: { s: GameState; compactLog: boolean }) {
  return (
    <div className="hud">
      <PlayersColumn s={s} />
      <Stage s={s} compactLog={compactLog} />
      <CoinFlight />
    </div>
  );
}

function Board({ s, stacked, compactLog }: { s: GameState; stacked: boolean; compactLog: boolean }) {
  const display = useDisplay();
  const current = s.players[s.turn.currentPlayerIndex];
  const currentPos = shownPosition(s, display, s.turn.currentPlayerIndex);
  const over = s.flow.phase === 'GameOver';
  const [focusIndex, setFocusIndex] = useState(0);
  const navigate = useCallback((from: number, delta: number) => {
    const next = (from + delta + 80) % 80;
    setFocusIndex(next);
    document.querySelector<HTMLElement>(`.board [data-space="${next}"]`)?.focus();
  }, []);
  return (
    <main className="board" aria-label={GAME_TITLE}>
      {BOARD.map((space) => (
        <Tile
          key={space.index}
          s={s}
          index={space.index}
          ring={space.index === currentPos && !over && current ? current.color : null}
          focusable={space.index === focusIndex}
          onNavigate={navigate}
        />
      ))}
      <div className="ocean">
        <OceanArt />
        <TokenLayer s={s} />
        {!stacked && <Hud s={s} compactLog={compactLog} />}
      </div>
    </main>
  );
}

function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const state = ui.get();
      if (state.rules.open) return; // the guide handles its own keys
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]');
      if (state.confirm) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeConfirm();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (state.quickHelp) ui.set({ quickHelp: null });
        else if (state.menuOpen) ui.set({ menuOpen: false });
        else if (state.sheet) closeSheet();
        else if (state.pinned !== null) ui.set({ pinned: null });
        return;
      }
      if (typing) return;
      const s = app.get().game;
      if (!s) return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        e.preventDefault();
        openRules();
        return;
      }
      if (state.sheet || state.menuOpen) return;
      if (key === 'b' && validateAction(s, { type: 'buy' }) === null) {
        dispatch({ type: 'buy' });
      } else if (key === 'p' && validateAction(s, { type: 'decline' }) === null) {
        dispatch({ type: 'decline' });
      } else if (key === 't' && legalTypes(s).has('proposeTrade')) {
        e.preventDefault();
        openSheet({ kind: 'trade' });
      } else if (key === ' ' || key === 'enter') {
        // A focused control keeps its own Space/Enter; board tiles pass it to the primary button.
        if (target?.closest('button:not(.tile), a, [role="switch"], summary')) return;
        if (s.flow.trade || (s.flow.phase === 'PassDevice' && s.flow.notices.length === 0)) return;
        const spec = primarySpec(s);
        if (!spec) return;
        e.preventDefault();
        if (spec.reason) refuse(spec.reason, 'primary');
        else dispatch(spec.action, 'primary');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function GameScreen() {
  const s = useGame();
  const u = useUi();
  const display = useDisplay();
  const animationSpeed = useAnimationSpeed();
  const stacked = useMediaQuery(STACKED_QUERY);
  const compactLog = useMediaQuery(COMPACT_QUERY);
  useKeyboard();
  useEffect(() => () => closeRules(), []);
  const showPass = s.flow.phase === 'PassDevice' && s.flow.notices.length === 0 && !s.flow.trade;
  return (
    <div
      className={`game-screen ${display.busy ? 'is-animating' : ''} ${stacked ? 'is-stacked' : ''}`}
      data-phase={s.flow.phase}
      data-speed={animationSpeed}
    >
      <TopBar s={s} />
      <Board s={s} stacked={stacked} compactLog={compactLog} />
      {stacked && <Hud s={s} compactLog={false} />}
      {showPass && <PassDevice key={s.turn.turnNumber} s={s} />}
      {s.flow.trade && <TradeResponse key={`trade-${s.meta.logSeq}`} s={s} />}
      {!s.flow.trade && u.sheet?.kind === 'trade' && <TradeBuilder s={s} />}
      {u.sheet?.kind === 'properties' && <PropertyList s={s} player={u.sheet.player} />}
      {u.sheet?.kind === 'results' && <Results s={s} />}
      <QuickHelpPopover />
      <ConfirmDialog s={s} />
      <Toast />
      <Confetti />
      {DEBUG && <DebugPanel s={s} />}
    </div>
  );
}
