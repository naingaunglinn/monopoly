// Chat and stamps (spec section 18), online only. The chat panel lists the room's messages with the
// sender's token, and has a message box with a tray of rubber stamps beside it (quick reactions,
// words not emoji). A stamp thuds onto the sender's player card, like a passport stamp, in their
// colour. While the chat is closed, a new message shows briefly as a preview that opens the chat.
import { Clock, Laugh, Send, Sparkles, Stamp, ThumbsUp, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type RefObject } from 'react';
import { SEATS } from '../../data/players';
import { CHAT_MAX_LENGTH, STAMPS, type ChatMessage, type StampId } from '../../online/protocol';
import {
  chatOpened,
  chatPreview,
  PREVIEW_MS,
  requestChat,
  sendChat,
  setChatAs,
  stamps,
  useOnline,
  type OnlineState,
  type StampShow,
} from '../session/online';
import { inkOnPaper } from '../contrast';
import { showToast } from '../store';
import { chatTime, STAMP_WORDS, T } from '../strings';
import { TokenChip } from './glyphs';

export const STAMP_ICONS: Readonly<Record<StampId, LucideIcon>> = {
  nice: ThumbsUp,
  ouch: Zap,
  haha: Laugh,
  wow: Sparkles,
  hurry: Clock,
  gg: Trophy,
};

const tokenOf = (seat: number) => SEATS[seat % SEATS.length]?.token ?? 'globe';

function useBox<T>(box: { get: () => T; subscribe: (l: () => void) => () => void }): T {
  return useSyncExternalStore(box.subscribe, box.get, box.get);
}

/** While the chat input has focus or a draft, the phone sheet does not switch tabs under the player. */
let composing = false;
export function isComposing(): boolean {
  return composing;
}

/** The seat index of a message's sender now (lobby seats move up when someone leaves). */
function seatOf(st: OnlineState, m: ChatMessage): number {
  return st.view.seats.findIndex((s) => s.id === m.seatId);
}

function Sender({ st, m, size = 18 }: { st: OnlineState; m: ChatMessage; size?: number }) {
  const seat = seatOf(st, m);
  return <TokenChip token={tokenOf(seat >= 0 ? seat : 0)} color={m.color} size={size} />;
}

/** A small stamp mark, as it appears in the chat list and on the stamp buttons. */
export function StampMini({ stamp, color }: { stamp: StampId; color?: string }) {
  const Icon = STAMP_ICONS[stamp];
  return (
    <span className="stamp-mini" style={color ? { ['--stamp-ink' as string]: inkOnPaper(color) } : undefined}>
      <Icon aria-hidden="true" />
      {STAMP_WORDS[stamp]}
    </span>
  );
}

function ChatList({ st }: { st: OnlineState }) {
  const list = useRef<HTMLOListElement>(null);
  const mine = new Set(st.view.seats.flatMap((s, i) => (st.mine.includes(i) ? [s.id] : [])));
  const last = st.chat[st.chat.length - 1];
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last?.id]);
  if (st.chat.length === 0) return <p className="chat-empty">{T.chat.empty}</p>;
  return (
    <ol className="chat-list" ref={list} aria-label={T.chat.title}>
      {st.chat.map((m, i) => {
        const prev = st.chat[i - 1];
        // Messages in a row from the same sender within two minutes share one heading.
        const joined = prev !== undefined && prev.seatId === m.seatId && m.at - prev.at < 120_000 && !prev.stamp && !m.stamp;
        const own = mine.has(m.seatId);
        return (
          <li key={m.id} className={`chat-line ${own ? 'is-own' : ''} ${joined ? 'is-joined' : ''} ${m.stamp ? 'is-stamp' : ''}`}>
            {!joined && (
              <span className="chat-head">
                <Sender st={st} m={m} />
                <span className="chat-name">{m.name}</span>
                <span className="chat-time">{chatTime(m.at)}</span>
              </span>
            )}
            {m.stamp ? (
              <span className="chat-stamp">
                <StampMini stamp={m.stamp} color={m.color} />
                <span className="sr-only">{T.chat.stamped(m.name, STAMP_WORDS[m.stamp])}</span>
              </span>
            ) : (
              <p className="chat-text">{m.text}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StampRow({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="stamp-row" id="stamp-tray" role="group" aria-label={T.chat.stampsLabel}>
      {STAMPS.map((stamp) => (
        <button
          key={stamp}
          type="button"
          id={`stamp-${stamp}`}
          className="stamp-btn"
          aria-label={T.chat.stampButton(STAMP_WORDS[stamp])}
          aria-disabled={disabled || busy || undefined}
          onClick={async () => {
            if (disabled || busy) return;
            setBusy(true);
            const err = await sendChat({ stamp });
            setBusy(false);
            if (err) showToast(err);
          }}
        >
          <StampMini stamp={stamp} />
        </button>
      ))}
    </div>
  );
}

/** Open dialogs, sheets, menus and help: while one is open the chat box never takes the cursor. */
const FOCUS_BLOCKERS = '[data-sheet]:not([data-sheet="trade-waiting"]), [role="dialog"], [role="alertdialog"], .quick-help';

/**
 * Room play with a mouse (owner request, D97): the message box keeps the cursor, so a player can
 * type at any moment and press Enter to send. After a click elsewhere, or when the focused control
 * goes away, the cursor comes back, unless another text field or list has it, a dialog, sheet or
 * menu is open, or the player is selecting text. Keyboard moves (Tab) are left alone.
 */
function useKeepFocus(input: RefObject<HTMLInputElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const focus = () => {
      const el = input.current;
      if (!el) return;
      const active = document.activeElement as HTMLElement | null;
      if (active === el) return;
      if (active && active !== document.body && active.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector(FOCUS_BLOCKERS)) return;
      if (window.getSelection()?.toString()) return;
      el.focus({ preventScroll: true });
    };
    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(focus, 0);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (e.relatedTarget === null) later();
    };
    focus();
    document.addEventListener('pointerup', later, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerup', later, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [input, enabled]);
}

function Composer({ st, keepFocus }: { st: OnlineState; keepFocus: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // The stamp tray stays open after a stamp, so a few can follow; the stamp button closes it.
  const [tray, setTray] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useKeepFocus(input, keepFocus);
  const offline = st.link === 'offline' || st.link === 'gone';
  const seats = st.view.seats.flatMap((s, i) => (st.mine.includes(i) ? [{ s, i }] : []));
  useEffect(() => () => void (composing = false), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || busy || offline) return;
    setBusy(true);
    const err = await sendChat({ text: clean });
    setBusy(false);
    if (err) {
      showToast(err);
      return;
    }
    setText('');
    composing = document.activeElement === input.current;
    input.current?.focus();
  };
  return (
    <form className="chat-form" onSubmit={submit}>
      {seats.length > 1 && (
        <label className="chat-as">
          <span>{T.chat.as}</span>
          <select id="chat-as" value={st.chatAs ?? ''} onChange={(e) => setChatAs(e.target.value)}>
            {seats.map(({ s }) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {tray && <StampRow disabled={offline} />}
      <div className="chat-entry">
        <button
          type="button"
          id="chat-stamps"
          className={`icon-btn chat-stamps ${tray ? 'is-on' : ''}`}
          aria-expanded={tray}
          aria-controls="stamp-tray"
          aria-label={T.chat.stampsLabel}
          title={T.chat.stampsLabel}
          onClick={() => setTray(!tray)}
        >
          <Stamp size={18} aria-hidden="true" />
        </button>
        <input
          ref={input}
          id="chat-input"
          className="text-input chat-input"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={T.chat.placeholder}
          aria-label={T.chat.inputLabel}
          autoComplete="off"
          enterKeyHint="send"
          onChange={(e) => {
            setText(e.target.value);
            composing = e.target.value.length > 0 || document.activeElement === e.target;
          }}
          onFocus={() => (composing = true)}
          onBlur={(e) => (composing = e.target.value.length > 0)}
        />
        <button
          type="submit"
          id="chat-send"
          className="icon-btn chat-send"
          aria-label={T.chat.send}
          title={T.chat.send}
          aria-disabled={!text.trim() || busy || offline || undefined}
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

/**
 * The room's chat: the messages, the message box and the stamps. Opening it marks everything read.
 * With `keepFocus` (room play with a mouse) the message box keeps the cursor.
 */
export function ChatPanel({ className = '', keepFocus = false }: { className?: string; keepFocus?: boolean }) {
  const st = useOnline();
  useEffect(() => chatOpened(), []);
  if (!st) return null;
  return (
    <section className={`chat ${className}`} aria-label={T.chat.title} data-no-skip="">
      <ChatList st={st} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          const m = st.chat[st.chat.length - 1];
          if (!m) return '';
          return m.stamp ? T.chat.stamped(m.name, STAMP_WORDS[m.stamp]) : `${m.name}: ${m.text ?? ''}`;
        })()}
      </div>
      <Composer st={st} keepFocus={keepFocus} />
    </section>
  );
}

/** The unread count beside a Chat tab or button. */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="chat-badge" aria-label={T.chat.unread(count)}>
      {count > 9 ? '9+' : count}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// On-screen effects

/** Where a stamp lands: the sender's card or lobby row when one is on screen, else the board. */
function anchorFor(seat: number | null): { x: number; y: number } {
  const candidates = seat === null ? [] : Array.from(document.querySelectorAll<HTMLElement>(`[data-seat-anchor="${seat}"]`));
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    // A chip in the top bar (room play): the stamp lands just below it, whole on screen.
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return { x: r.left + r.width / 2, y: Math.max(r.top + r.height / 2, 64) };
  }
  const board = document.querySelector<HTMLElement>('.board-viewport, .ocean, .lobby-card');
  const r = board?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 140) } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}

function StampMark({ show }: { show: StampShow }) {
  const [at] = useState(() => anchorFor(show.seat));
  // A slight tilt, different for every stamp, as when stamped by hand.
  const tilt = ((show.key * 37) % 17) - 8;
  const Icon = STAMP_ICONS[show.stamp];
  return (
    <div
      className="stamp-mark"
      style={{ left: at.x, top: at.y, ['--stamp-ink' as string]: inkOnPaper(show.color), ['--tilt' as string]: `${tilt}deg` }}
      role="img"
      aria-label={T.chat.stamped(show.name, STAMP_WORDS[show.stamp])}
    >
      <span className="stamp-face">
        <span className="stamp-word">
          <Icon aria-hidden="true" />
          {STAMP_WORDS[show.stamp]}
        </span>
        <span className="stamp-name">{show.name}</span>
      </span>
    </div>
  );
}

/** Stamps on screen now (game and lobby). */
export function StampLayer() {
  const list = useBox(stamps);
  if (list.length === 0) return null;
  return (
    <div className="stamp-layer" aria-live="polite">
      {list.map((s) => (
        <StampMark key={s.key} show={s} />
      ))}
    </div>
  );
}

/** A new message while the chat is closed: shown briefly; tapping it opens the chat. */
export function ChatPreview() {
  const m = useBox(chatPreview);
  const st = useOnline();
  useEffect(() => {
    if (!m) return;
    const timer = window.setTimeout(() => {
      if (chatPreview.get()?.id === m.id) chatPreview.set(null);
    }, PREVIEW_MS);
    return () => window.clearTimeout(timer);
  }, [m]);
  if (!m || !st) return null;
  return (
    <button
      type="button"
      key={m.id}
      id="chat-preview"
      className="chat-preview"
      data-no-skip=""
      style={{ ['--sender' as string]: m.color }}
      aria-label={T.chat.preview(m.name)}
      onClick={() => requestChat()}
    >
      <Sender st={st} m={m} size={22} />
      <span className="chat-preview-text">
        <span className="chat-name">{m.name}</span> {m.text}
      </span>
    </button>
  );
}
