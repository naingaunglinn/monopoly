// The game screen: a slim top bar and the board ring filling the rest, every control inside the
// ring (spec section 11). Under 1024 px or in portrait the HUD moves below the board.
import {
  ArrowLeftRight,
  BookOpen,
  Copy,
  FastForward,
  Hammer,
  Hourglass,
  Layers,
  Loader2,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Save,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARD } from '../../data/board';
import { decisionMaker, freeActor, validateAction, type GameState, type Player } from '../../engine';
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
import { COMPACT_QUERY, PHONE_QUERY, useMediaQuery } from '../hooks';
import {
  ConfirmDialog,
  PassDevice,
  PropertyList,
  QuickHelpPopover,
  Results,
  SettingsFields,
  TradeBuilder,
  TradeResponse,
} from '../overlays/Overlays';
import { DebugPanel } from '../overlays/DebugPanel';
import { inviteLink, leaveToStart, useOnline, usePending, type OnlineState } from '../session/online';
import { PhoneGame } from './PhoneGame';
import { ActivePanel } from '../panels/DecisionPanels';
import {
  app,
  askConfirm,
  canAct,
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

/** The Menu button and its popover: settings, then Save and New game (local) or invite and leave (online). */
export function GameMenu({ s, compact = false }: { s: GameState; compact?: boolean }) {
  const { menuOpen } = useUi();
  const online = useOnline();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) ui.set({ menuOpen: false });
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuOpen]);
  return (
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
          <span className={compact ? 'sr-only' : 'btn-label'}>{T.top.menu}</span>
        </button>
        {menuOpen && (
          <div className="menu" role="dialog" aria-label={T.top.menu}>
            <SettingsFields s={s} />
            <div className="menu-sep" />
            {online ? (
              <>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    ui.set({ menuOpen: false });
                    void navigator.clipboard
                      ?.writeText(inviteLink(online.code))
                      .then(() => showToast(T.online.copied))
                      .catch(() => showToast(inviteLink(online.code)));
                  }}
                >
                  <Copy size={16} aria-hidden="true" />
                  {T.online.copy}
                </button>
                <button type="button" id="tb-leave" className="menu-item" onClick={() => leaveToStart()}>
                  <LogOut size={16} aria-hidden="true" />
                  {T.online.backToStart}
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
  );
}

function TopBar({ s }: { s: GameState }) {
  const online = useOnline();
  const display = useDisplay();
  const current = s.players[s.turn.currentPlayerIndex] as Player;
  const quick = s.meta.settings.mode === 'quick';
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
      {online && (
        <span className={`tb-room ${online.link === 'offline' ? 'is-off' : ''}`} title={online.link === 'offline' ? T.online.reconnecting : T.online.connected}>
          {online.link === 'offline' ? <WifiOff size={15} aria-hidden="true" /> : <Wifi size={15} aria-hidden="true" />}
          {T.online.room(online.code)}
        </span>
      )}
      <Button
        id="tb-rules"
        variant="ghost"
        label={T.top.rules}
        keyHint="R"
        icon={<BookOpen size={16} aria-hidden="true" />}
        onClick={() => openRules()}
      />
      <GameMenu s={s} />
    </header>
  );
}

export function PrimaryButton({ s }: { s: GameState }) {
  const spec = primarySpec(s);
  const shaking = useShake('primary');
  const { busy } = useDisplay();
  const online = useOnline();
  const waiting = usePending('primary');
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
  // Online: someone else decides; this device waits (their moves still play here live).
  const decider = decisionMaker(s);
  if (online && decider !== null && !canAct(decider)) {
    return (
      <div className="primary-slot">
        <button type="button" id="primary" className="btn btn-big btn-waiting" aria-disabled="true">
          <Hourglass size={18} aria-hidden="true" />
          <span className="btn-label">{T.online.waitingFor(s.players[decider]?.name ?? '')}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="primary-slot">
      <button
        type="button"
        id="primary"
        aria-busy={waiting || undefined}
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
        {waiting && <Loader2 className="spinner" size={18} aria-hidden="true" />}
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
  const online = useOnline();
  const actor = freeActor(s);
  const actorHere = canAct(actor);
  // "My properties": the free actor's on one device; online, this device's own player.
  const owner = online ? (actorHere && actor !== null ? actor : (online.mine[0] ?? s.turn.currentPlayerIndex)) : (actor ?? s.turn.currentPlayerIndex);
  return (
    <div className="action-bar">
      <PrimaryButton s={s} />
      <div className="secondary-actions">
        {types.has('openBuild') && canAct(decisionMaker(s)) && (
          <Button id="act-build" label={T.play.build} icon={<Hammer size={16} aria-hidden="true" />} action={{ type: 'openBuild' }} />
        )}
        {types.has('proposeTrade') && s.flow.phase !== 'Debt' && actorHere && (
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

/** The ring of tiles with the ocean, tokens and (on large screens) the HUD inside it. */
export function Board({ s, hud, compactLog }: { s: GameState; hud: boolean; compactLog: boolean }) {
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
        {hud && <Hud s={s} compactLog={compactLog} />}
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
        // Online, Space does nothing while another device decides.
        if (!canAct(decisionMaker(s))) return;
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

/**
 * Online, one device may hold several seats (two people on one laptop). When the next decision
 * moves from one of them to another, the device is handed over, as in a local game.
 */
function useHandover(s: GameState, online: OnlineState | null): { player: number; dismiss: () => void } | null {
  const decider = decisionMaker(s);
  const previous = useRef<number | null>(decider);
  const [player, setPlayer] = useState<number | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = decider;
    if (!online || decider === null || before === null || before === decider) return;
    if (online.mine.includes(before) && online.mine.includes(decider)) setPlayer(decider);
  }, [decider, online]);
  useEffect(() => {
    if (player !== null && decider !== player) setPlayer(null);
  }, [decider, player]);
  return player === null ? null : { player, dismiss: () => setPlayer(null) };
}

/** Online: a banner, the tab title and one short vibration when a decision becomes this device's. */
function useYourTurn(s: GameState, online: OnlineState | null): string | null {
  const decider = decisionMaker(s);
  const mine = online !== null && decider !== null && online.mine.includes(decider);
  // Starts false: opening the game (or rejoining) on one's own decision shows the banner too.
  const was = useRef(false);
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    if (!online) return;
    const before = was.current;
    was.current = mine;
    document.title = mine ? `${T.online.titleYourTurn} · ${GAME_TITLE}` : GAME_TITLE;
    if (!mine) {
      setBanner(null);
      return;
    }
    if (before || decider === null) return;
    const name = s.players[decider]?.name ?? '';
    setBanner(
      s.flow.trade ? T.online.yourTrade(name) : s.flow.phase === 'Auction' ? T.online.yourBid(name) : s.turn.currentPlayerIndex === decider ? T.online.yourTurn(name) : T.online.yourDecision(name),
    );
    try {
      const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
      if (activated) navigator.vibrate?.(200);
    } catch {
      // No vibration on this device.
    }
  }, [mine, decider, online, s]);
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 4000);
    return () => window.clearTimeout(timer);
  }, [banner]);
  useEffect(() => () => void (document.title = GAME_TITLE), []);
  return banner;
}

/** Keeps the screen awake during a game where the browser allows it (Wake Lock API). */
function useWakeLock(): void {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const wake = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Lock> } }).wakeLock;
    if (!wake) return;
    let lock: Lock | null = null;
    let alive = true;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      // The request is refused when hidden or not allowed: that is fine, the screen may then sleep.
      wake
        .request('screen')
        .then((l) => {
          if (alive) lock = l;
          else void l.release().catch(() => undefined);
        })
        .catch(() => undefined);
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

function LinkBar({ online }: { online: OnlineState }) {
  if (online.link === 'gone') {
    return (
      <div className="link-bar is-gone" role="alert">
        <span>{T.online.gone}</span>
        <Button id="link-back" label={T.online.backToStart} onClick={() => leaveToStart()} />
      </div>
    );
  }
  if (online.link !== 'offline') return null;
  return (
    <div className="link-bar" role="status">
      <Loader2 className="spinner" size={16} aria-hidden="true" />
      <span>{T.online.reconnecting}</span>
      <span className="link-bar-detail">{T.online.reconnectingDetail}</span>
    </div>
  );
}

export function GameScreen() {
  const s = useGame();
  const u = useUi();
  const display = useDisplay();
  const online = useOnline();
  const { mode } = useApp();
  const animationSpeed = useAnimationSpeed();
  const phone = useMediaQuery(PHONE_QUERY);
  const compactLog = useMediaQuery(COMPACT_QUERY);
  const handover = useHandover(s, online);
  const banner = useYourTurn(s, online);
  useKeyboard();
  useWakeLock();
  useEffect(() => () => closeRules(), []);
  const showPass = s.flow.phase === 'PassDevice' && s.flow.notices.length === 0 && !s.flow.trade;
  return (
    <div
      className={`game-screen ${display.busy ? 'is-animating' : ''} ${phone ? 'is-phone' : ''} ${online ? 'is-online' : ''}`}
      data-phase={s.flow.phase}
      data-speed={animationSpeed}
    >
      {online && <LinkBar online={online} />}
      {phone ? (
        <PhoneGame s={s} />
      ) : (
        <>
          <TopBar s={s} />
          <Board s={s} hud compactLog={compactLog} />
        </>
      )}
      {showPass && <PassDevice key={s.turn.turnNumber} s={s} />}
      {handover && !s.flow.trade && <PassDevice s={s} player={handover.player} onReady={handover.dismiss} />}
      {banner && !handover && (
        <div className="turn-banner" role="status" key={banner}>
          {banner}
        </div>
      )}
      {s.flow.trade && <TradeResponse key={`trade-${s.meta.logSeq}`} s={s} />}
      {!s.flow.trade && u.sheet?.kind === 'trade' && <TradeBuilder s={s} />}
      {u.sheet?.kind === 'properties' && <PropertyList s={s} player={u.sheet.player} />}
      {u.sheet?.kind === 'results' && <Results s={s} />}
      <QuickHelpPopover />
      <ConfirmDialog s={s} />
      <Confetti />
      {DEBUG && mode === 'local' && <DebugPanel s={s} />}
    </div>
  );
}
