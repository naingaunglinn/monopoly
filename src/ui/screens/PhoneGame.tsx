// The game on phones and other small screens (spec section 17, Phones), in portrait and landscape,
// for local and online games alike:
// - a slim status bar: round, whose turn, my cash, Rules and Menu;
// - the board in a viewport that can be pinched, panned (one finger) and double-tapped (whole board
//   / follow); it centres on the moving token and follows it. Tapping a tile shows its Focus Card;
// - a sheet (bottom in portrait, side in landscape) with the primary button always visible, the
//   dice, Build and Trade when they apply, and tabs: Card, Players, Log, Chat (online) and Mine. A
//   decision panel opens in the sheet as its own tab; online, someone else's decision does not pull
//   a player out of the chat, nor does their own while they are writing.
// The board keeps its desktop layout at a fixed size and is scaled as a whole (camera in a ref,
// written straight to the transform, so gestures never re-render the tiles).
import { ArrowLeftRight, BookOpen, Hammer, IdCard, LayoutList, MessageCircle, Repeat, ScrollText, Sparkles, Users } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { decisionMaker, freeActor, legalActions, type GameState, type Player } from '../../engine';
import { prefersReducedMotion } from '../animation';
import { Button } from '../components/Button';
import { ChatPanel, isComposing, UnreadBadge } from '../components/Chat';
import { VoiceButton } from '../components/Voice';
import { Die } from '../components/Dice';
import { FocusCard } from '../components/FocusCard';
import { TokenChip } from '../components/glyphs';
import { Log } from '../components/Log';
import { PlayersColumn } from '../components/PlayersColumn';
import { shownCash, shownDice, shownPosition, useDisplay } from '../display';
import { PropertyGroups } from '../overlays/Overlays';
import { ActivePanel } from '../panels/DecisionPanels';
import { chatRequest, useOnline } from '../session/online';
import { canAct, openRules, openSheet, useAnimationSpeed, useApp, useUi } from '../store';
import { money, recapLine, T } from '../strings';
import { names } from '../view';
import { Board, GameMenu, PrimaryButton } from './GameScreen';

/** The board's layout size on phones: the 1280 x 720 desktop board (below its top bar), scaled as a whole. */
export const CANVAS_W = 1280;
export const CANVAS_H = 676;
/** Following a token, 11px tile text shows at 10px or more on screen. */
const FOLLOW_SCALE = 0.92;
const MAX_SCALE = 1.6;

type Mode = 'follow' | 'fit' | 'free';

// ---------------------------------------------------------------------------------------------
// Status bar

function StatusBar({ s }: { s: GameState }) {
  const display = useDisplay();
  const online = useOnline();
  const current = s.players[s.turn.currentPlayerIndex] as Player;
  // "My cash": this device's player online; on one shared device, the player whose turn it is.
  const me = online ? (s.players[online.mine[0] ?? -1] ?? current) : current;
  const quick = s.meta.settings.mode === 'quick';
  const round = quick ? T.top.roundOf(s.turn.roundNumber, s.meta.settings.roundLimit) : T.top.round(s.turn.roundNumber);
  return (
    <header className="phone-status">
      <span className="ps-round" aria-label={round} title={round}>
        <Repeat aria-hidden="true" />
        {quick ? `${s.turn.roundNumber}/${s.meta.settings.roundLimit}` : s.turn.roundNumber}
      </span>
      {s.flow.phase !== 'GameOver' && (
        <span className="ps-turn" style={{ ['--player' as string]: current.color }}>
          <TokenChip token={current.token} color={current.color} size={22} />
          <span className="ps-name">{current.name}</span>
        </span>
      )}
      {(online || s.flow.phase !== 'GameOver') && (
        <span className="ps-cash money" aria-label={`${me.name}: ${money(shownCash(s, display, me.id))}`}>
          {online && <TokenChip token={me.token} color={me.color} size={16} />}
          {money(shownCash(s, display, me.id))}
        </span>
      )}
      <span className="tb-spacer" />
      {/* Online, the voice switch takes the place of Rules, which moves into the menu (room on 360 px). */}
      {online ? (
        <VoiceButton compact />
      ) : (
        <button type="button" id="tb-rules" className="icon-btn ps-icon" aria-label={T.top.rules} title={T.top.rules} onClick={() => openRules()}>
          <BookOpen size={20} aria-hidden="true" />
        </button>
      )}
      <GameMenu s={s} compact />
    </header>
  );
}

// ---------------------------------------------------------------------------------------------
// Board viewport: pinch, pan, double-tap, follow

function BoardViewport({ s }: { s: GameState }) {
  const display = useDisplay();
  const speed = useAnimationSpeed();
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ x: 0, y: 0, k: FOLLOW_SCALE });
  const placed = useRef(false);
  const [mode, setMode] = useState<Mode>('follow');
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const smooth = speed !== 'off' && !prefersReducedMotion();
  const smoothRef = useRef(smooth);
  smoothRef.current = smooth;

  const size = () => {
    const v = viewportRef.current;
    return v ? { w: Math.max(1, v.clientWidth), h: Math.max(1, v.clientHeight) } : { w: 1, h: 1 };
  };
  const fitScale = () => {
    const { w, h } = size();
    return Math.min(w / CANVAS_W, h / CANVAS_H);
  };
  const clampCamera = () => {
    const { w, h } = size();
    const c = cam.current;
    c.k = Math.min(MAX_SCALE, Math.max(fitScale(), c.k));
    const bw = CANVAS_W * c.k;
    const bh = CANVAS_H * c.k;
    const margin = 16;
    c.x = bw <= w ? (w - bw) / 2 : Math.min(margin, Math.max(w - bw - margin, c.x));
    c.y = bh <= h ? (h - bh) / 2 : Math.min(margin, Math.max(h - bh - margin, c.y));
  };
  const write = (animate: boolean) => {
    const el = canvasRef.current;
    if (!el) return;
    const { x, y, k } = cam.current;
    el.style.transition = animate && smoothRef.current && placed.current ? 'transform 380ms cubic-bezier(0.3, 0.7, 0.4, 1)' : 'none';
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
    el.dataset.scale = k.toFixed(3);
    placed.current = true;
  };
  const centerOn = (space: number, animate: boolean) => {
    const tile = canvasRef.current?.querySelector<HTMLElement>(`.tile[data-space="${space}"]`);
    if (!tile) return;
    const { w, h } = size();
    const k = Math.max(FOLLOW_SCALE, fitScale());
    const cx = tile.offsetLeft + tile.offsetWidth / 2;
    const cy = tile.offsetTop + tile.offsetHeight / 2;
    cam.current = { k, x: w / 2 - cx * k, y: h / 2 - cy * k };
    clampCamera();
    write(animate);
  };
  const fitAll = (animate: boolean) => {
    cam.current.k = fitScale();
    clampCamera();
    write(animate);
  };

  // Follow the token that moves (or the current player's), and follow again whenever a move starts.
  const follower = display.mover ?? s.turn.currentPlayerIndex;
  const target = shownPosition(s, display, follower);
  // Any move (animated or not: speed Off) brings the camera back to following.
  const { events, eventSeq } = useApp();
  useEffect(() => {
    if (display.mover !== null && modeRef.current !== 'follow') setMode('follow');
  }, [display.mover]);
  useEffect(() => {
    if (events.some((e) => e.type === 'moved' || e.type === 'teleported') && modeRef.current !== 'follow') setMode('follow');
  }, [eventSeq]);
  useLayoutEffect(() => {
    if (mode === 'follow') centerOn(target, true);
    else if (mode === 'fit') fitAll(true);
    // `target` changes with every step of a move: the camera glides along.
  }, [mode, target]);

  // Size changes (rotation, sheet resize): keep the mode.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (modeRef.current === 'fit') fitAll(false);
      else if (modeRef.current === 'follow') {
        const t = (canvasRef.current?.dataset.target ?? '') as string;
        if (t) centerOn(Number(t), false);
      } else {
        clampCamera();
        write(false);
      }
    });
    ro.observe(v);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.dataset.target = String(target);
  }, [target]);

  // Gestures: one finger pans, two fingers pinch, double-tap toggles the whole board and following.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; cx: number; cy: number; k: number; dist: number; mx: number; my: number } | null = null;
    let moved = 0;
    let dragged = false;
    let lastTap = { t: 0, x: 0, y: 0 };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        clampCamera();
        write(false);
      });
    };
    const begin = () => {
      const pts = [...pointers.values()];
      const c = cam.current;
      const [a, b] = pts;
      if (a && !b) start = { x: a.x, y: a.y, cx: c.x, cy: c.y, k: c.k, dist: 0, mx: 0, my: 0 };
      else if (a && b) start = { x: 0, y: 0, cx: c.x, cy: c.y, k: c.k, dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    const leaveFollow = () => {
      if (modeRef.current !== 'free') setMode('free');
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      begin();
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];
      const c = cam.current;
      const r = el.getBoundingClientRect();
      const [a, b] = pts;
      if (a && !b) {
        const dx = a.x - start.x;
        const dy = a.y - start.y;
        moved = Math.max(moved, Math.hypot(dx, dy));
        if (moved < 8) return;
        c.x = start.cx + dx;
        c.y = start.cy + dy;
      } else if (a && b && start.dist > 0) {
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const k = Math.min(MAX_SCALE, Math.max(fitScale(), (start.k * dist) / start.dist));
        const mx = (a.x + b.x) / 2 - r.left;
        const my = (a.y + b.y) / 2 - r.top;
        // The board point under the starting midpoint stays under the fingers.
        const bx = (start.mx - r.left - start.cx) / start.k;
        const by = (start.my - r.top - start.cy) / start.k;
        c.k = k;
        c.x = mx - bx * k;
        c.y = my - by * k;
        moved = 99;
      }
      leaveFollow();
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size > 0) {
        begin();
        return;
      }
      if (moved >= 8) dragged = true;
      else {
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
          lastTap = { t: 0, x: 0, y: 0 };
          setMode((m) => (m === 'fit' ? 'follow' : 'fit'));
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      start = null;
    };
    // The click that ends a drag must not pin a tile.
    const click = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = cam.current;
      const r = el.getBoundingClientRect();
      const k = Math.min(MAX_SCALE, Math.max(fitScale(), c.k * Math.exp(-e.deltaY * 0.0015)));
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      c.x = px - ((px - c.x) / c.k) * k;
      c.y = py - ((py - c.y) / c.k) * k;
      c.k = k;
      leaveFollow();
      schedule();
    };
    // iOS Safari zooms the page on its own gesture events: not on the board.
    const noPageZoom = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', noPageZoom);
    el.addEventListener('gesturechange', noPageZoom);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', noPageZoom);
      el.removeEventListener('gesturechange', noPageZoom);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={viewportRef} className="board-viewport" data-gesture-zone="" data-mode={mode} aria-label={T.phone.boardLabel}>
      <div ref={canvasRef} className="board-canvas">
        <Board s={s} hud={false} compactLog={false} />
      </div>
      <span className="viewport-hint" aria-hidden="true">
        {mode === 'fit' ? T.phone.hintFollow : T.phone.hintFit}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The sheet: primary row, tabs, and the decision panel

type Tab = 'decision' | 'card' | 'players' | 'log' | 'chat' | 'mine';

function MiniDice({ s }: { s: GameState }) {
  const display = useDisplay();
  const dice = shownDice(s, display);
  const shown: [number, number] = dice ?? [5, 2];
  return (
    <div className={`mini-dice ${dice ? '' : 'is-idle'}`} aria-label={dice ? T.play.total(dice[0] + dice[1]) : T.play.rollDice}>
      <Die value={shown[0]} rolling={display.rolling} index={0} />
      <Die value={shown[1]} rolling={display.rolling} index={1} />
      {dice && !display.rolling && <span className="mini-total">{dice[0] + dice[1]}</span>}
    </div>
  );
}

function TabButton({
  tab,
  current,
  onPick,
  icon,
  label,
  alert,
  badge = 0,
}: {
  tab: Tab;
  current: Tab;
  onPick: (t: Tab) => void;
  icon: ReactNode;
  label: string;
  alert?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${tab}`}
      aria-selected={tab === current}
      className={`phone-tab ${tab === current ? 'is-on' : ''} ${alert ? 'is-alert' : ''}`}
      onClick={() => onPick(tab)}
    >
      <span className="phone-tab-icon">
        {icon}
        <UnreadBadge count={badge} />
      </span>
      <span>{label}</span>
    </button>
  );
}

function Sheet({ s }: { s: GameState }) {
  const display = useDisplay();
  const { pinned } = useUi();
  const { refusal } = useApp();
  const online = useOnline();
  const pending = s.flow.notices.length > 0 || !['PassDevice', 'AwaitRoll', 'AwaitEndTurn'].includes(s.flow.phase);
  // Panels wait for the animation to finish, as on large screens.
  const showPanel = pending && !display.busy;
  // The tab the player chose, and the decision they stepped away from (to look at another tab).
  // A new decision shows at once, in the same render: no frame shows the old tab first.
  const [chosen, setChosen] = useState<Tab>('card');
  const [awayFrom, setAwayFrom] = useState<string | null>(null);
  const decisionKey = `${s.flow.phase}-${s.flow.notices.length}-${s.turn.turnNumber}`;
  // Online, the chat stays open through other players' decisions, and through one's own while writing.
  const mineToDecide = !online || canAct(decisionMaker(s));
  const holdChat = chosen === 'chat' && (!mineToDecide || isComposing());
  const tab: Tab = showPanel && awayFrom !== decisionKey && !holdChat ? 'decision' : chosen === 'decision' ? 'card' : chosen;
  const setTab = (t: Tab) => {
    setChosen(t);
    setAwayFrom(t === 'decision' ? null : decisionKey);
  };
  // Tapping a tile shows its card.
  useEffect(() => {
    if (pinned === null) return;
    setChosen('card');
    setAwayFrom(decisionKey);
  }, [pinned]);
  // A tapped message preview opens the chat.
  const request = useSyncExternalStore(chatRequest.subscribe, chatRequest.get, chatRequest.get);
  const seenRequest = useRef(request);
  useEffect(() => {
    if (request === seenRequest.current) return;
    seenRequest.current = request;
    setChosen('chat');
    setAwayFrom(decisionKey);
  }, [request]);
  const position = shownPosition(s, display, s.turn.currentPlayerIndex);
  const actor = freeActor(s);
  const legal = new Set(legalActions(s).map((a) => a.type));
  const me = online ? (online.mine[0] ?? s.turn.currentPlayerIndex) : (actor ?? s.turn.currentPlayerIndex);
  const showRecap = s.turn.dice === null && s.flow.phase !== 'GameOver' && !showPanel;
  const doublesAgain = s.turn.rollsLeft > 0 && !!s.turn.dice && s.turn.dice[0] === s.turn.dice[1] && s.flow.phase === 'AwaitRoll' && !display.busy;
  return (
    <section className="phone-sheet" aria-label={T.phone.sheetLabel}>
      <div className="phone-sheet-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'decision' && showPanel && (
          <div className="panel-layer phone-panel">
            <ActivePanel s={s} />
          </div>
        )}
        {(tab === 'card' || (tab === 'decision' && !showPanel)) && (
          <div className="phone-card">
            <FocusCard s={s} fallback={position} />
          </div>
        )}
        {tab === 'players' && <PlayersColumn s={s} />}
        {tab === 'log' && <Log s={s} compact={false} />}
        {tab === 'chat' && online && <ChatPanel className="phone-chat" />}
        {tab === 'mine' && (
          <div className="phone-mine">
            {legal.has('proposeTrade') && s.flow.phase !== 'Debt' && canAct(actor) && (
              <Button id="mine-trade" label={T.play.trade} icon={<ArrowLeftRight size={16} aria-hidden="true" />} onClick={() => openSheet({ kind: 'trade' })} />
            )}
            <PropertyGroups s={s} player={me} />
          </div>
        )}
      </div>
      <nav className="phone-tabs" role="tablist" aria-label={T.phone.tabsLabel}>
        {showPanel && <TabButton tab="decision" current={tab} onPick={setTab} icon={<Sparkles aria-hidden="true" />} label={T.phone.decision} alert />}
        <TabButton tab="card" current={tab} onPick={setTab} icon={<IdCard aria-hidden="true" />} label={T.phone.card} />
        <TabButton tab="players" current={tab} onPick={setTab} icon={<Users aria-hidden="true" />} label={T.phone.players} />
        <TabButton tab="log" current={tab} onPick={setTab} icon={<ScrollText aria-hidden="true" />} label={T.phone.log} />
        {online && (
          <TabButton
            tab="chat"
            current={tab}
            onPick={setTab}
            icon={<MessageCircle aria-hidden="true" />}
            label={T.chat.title}
            alert={online.unread > 0}
            badge={online.unread}
          />
        )}
        <TabButton tab="mine" current={tab} onPick={setTab} icon={<LayoutList aria-hidden="true" />} label={T.phone.mine} />
      </nav>
      {refusal && (
        <p className="refusal phone-refusal" role="alert">
          {refusal.reason}
        </p>
      )}
      {!refusal && doublesAgain && <p className="phone-hint">{T.play.doubles}</p>}
      {!refusal && !doublesAgain && showRecap && <p className="phone-hint">{recapLine(s.turn.recap, names(s))}</p>}
      <div className="phone-actions">
        <MiniDice s={s} />
        <PrimaryButton s={s} />
        {legal.has('openBuild') && canAct(s.turn.currentPlayerIndex) && (
          <Button id="act-build" label={T.play.build} ariaLabel={T.play.build} icon={<Hammer size={18} aria-hidden="true" />} action={{ type: 'openBuild' }} className="phone-build" />
        )}
      </div>
    </section>
  );
}

export function PhoneGame({ s }: { s: GameState }) {
  return (
    <>
      <StatusBar s={s} />
      <div className="phone-main">
        <BoardViewport s={s} />
        <Sheet s={s} />
      </div>
    </>
  );
}
