// Online play screens (spec section 17): create or join a room, and the lobby where everyone takes a
// seat, the host chooses the settings and starts the game.
import { ArrowLeft, Check, Copy, Crown, LogIn, LogOut, Play, Plus, Share2, UserRound, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SETUP } from '../../data/balance';
import { SEATS } from '../../data/players';
import { MAX_SEATS, MIN_SEATS, type RoomSettings } from '../../online/protocol';
import { Button } from '../components/Button';
import { ColorPicker } from '../components/ColorPicker';
import { ModeFields, RuleToggles, type GameOptions } from '../components/Fields';
import { TokenChip } from '../components/glyphs';
import { OceanArt } from '../components/OceanArt';
import { setPrefs, usePrefs } from '../prefs';
import {
  addLocalSeat,
  amHost,
  changeRoomSettings,
  createRoom,
  hostControl,
  inviteLink,
  isSeatConnected,
  joinRoom,
  leaveRoom,
  lookUpRoom,
  reclaimSeat,
  startRoomGame,
  updateSeat,
  useJoining,
  useOnline,
  usePresenceClock,
  type OnlineState,
} from '../session/online';
import { goTo, showToast } from '../store';
import { defaultPlayerName, T } from '../strings';

const tokenOf = (seat: number) => SEATS[seat % SEATS.length]?.token ?? 'globe';

/** Shares the invite link: the phone's share sheet when there is one, else the clipboard. */
async function shareInvite(code: string): Promise<void> {
  const url = inviteLink(code);
  try {
    if (typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches) {
      await navigator.share({ title: T.online.shareText(code), text: T.online.shareText(code), url });
      return;
    }
  } catch {
    // Cancelled, or not allowed: fall back to copying.
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast(T.online.copied);
  } catch {
    showToast(url);
  }
}

// ---------------------------------------------------------------------------------------------
// Create or join

export function OnlineEntryScreen() {
  const j = useJoining();
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.onlineName);
  const [code, setCode] = useState(j.code);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (j.mode === 'join' && !j.code ? codeRef.current : nameRef.current)?.focus({ preventScroll: true });
  }, [j.mode, j.code]);
  useEffect(() => setCode(j.code), [j.code]);

  const cleanCode = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const started = j.view && j.view.status !== 'lobby';
  const takeOver = started && j.view ? j.view.seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.removed && !isSeatConnected(j, s.id)) : [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (j.busy) return;
    setPrefs({ onlineName: name.trim() });
    if (j.mode === 'create') void createRoom(name);
    else if (cleanCode.length === 4) void joinRoom(cleanCode, name);
  };

  return (
    <main className="setup-screen online-screen">
      <OceanArt />
      <form className="online-card" onSubmit={submit} aria-labelledby="online-title">
        <h1 id="online-title" className="setup-title">
          {j.mode === 'create' ? T.online.createTitle : T.online.joinTitle}
        </h1>
        <p className="online-hint">{j.mode === 'create' ? T.online.createHint : T.online.joinHint}</p>
        {j.mode === 'join' && (
          <label className="online-field">
            <span className="field-label">{T.online.roomCode}</span>
            <input
              ref={codeRef}
              id="online-code"
              className="text-input code-input"
              value={cleanCode}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={4}
              placeholder="ABCD"
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => cleanCode.length === 4 && cleanCode !== j.code && void lookUpRoom(cleanCode)}
            />
          </label>
        )}
        {!started && (
          <label className="online-field">
            <span className="field-label">{T.online.yourName}</span>
            <input
              ref={nameRef}
              id="online-name"
              className="text-input"
              value={name}
              maxLength={SETUP.maxNameLength}
              placeholder={defaultPlayerName(0)}
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {started && (
          <div className="take-over">
            <p className="online-hint">{T.online.joinStarted}</p>
            {takeOver.length > 0 ? (
              <>
                <p className="online-hint">{T.online.takeOverHint}</p>
                <ul className="take-over-list">
                  {takeOver.map(({ s, i }) => (
                    <li key={s.id}>
                      <button type="button" id={`reclaim-${i}`} className="btn btn-secondary take-over-btn" onClick={() => void reclaimSeat(j.code, s.id)}>
                        <TokenChip token={tokenOf(i)} color={s.color} size={24} />
                        <span className="btn-label">{T.online.takeOver(s.name)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="online-hint">{T.online.noFreeSeat}</p>
            )}
          </div>
        )}
        {j.error && (
          <p className="refusal" role="alert">
            {j.error}
          </p>
        )}
        <footer className="setup-footer">
          <Button label={T.online.back} icon={<ArrowLeft size={18} aria-hidden="true" />} onClick={() => goTo('start')} />
          {!started && (
            <button
              type="submit"
              id="online-submit"
              className="btn btn-primary"
              aria-disabled={(j.mode === 'join' && cleanCode.length !== 4) || j.busy || undefined}
            >
              {j.mode === 'create' ? <Plus size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
              <span className="btn-label">{j.mode === 'create' ? T.online.create : T.online.joinButton}</span>
            </button>
          )}
        </footer>
      </form>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Lobby

function SeatRow({ st, index }: { st: OnlineState; index: number }) {
  const seat = st.view.seats[index];
  const mine = st.mine.includes(index);
  const host = amHost(st);
  const [name, setName] = useState(seat?.name ?? '');
  useEffect(() => setName(seat?.name ?? ''), [seat?.name]);
  if (!seat) return null;
  const connected = isSeatConnected(st, seat.id);
  const holders = Object.fromEntries(st.view.seats.flatMap((s, i) => (i === index ? [] : [[s.color, s.name]])));
  const saveName = () => {
    if (name.trim() !== seat.name) void updateSeat(index, { name }).then((err) => err && showToast(err));
  };
  return (
    <li className={`lobby-seat ${mine ? 'is-mine' : ''}`} data-seat={index}>
      {mine ? (
        <ColorPicker
          seat={index}
          name={seat.name}
          token={tokenOf(index)}
          color={seat.color}
          holders={holders}
          exclusive
          onPick={(color) => void updateSeat(index, { color }).then((err) => err && showToast(err))}
        />
      ) : (
        <span className="lobby-chip">
          <TokenChip token={tokenOf(index)} color={seat.color} size={30} />
        </span>
      )}
      {mine ? (
        <input
          className="text-input lobby-name-input"
          aria-label={T.online.nameOf(index + 1)}
          value={name}
          maxLength={SETUP.maxNameLength}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      ) : (
        <span className="lobby-name">{seat.name}</span>
      )}
      <span className="lobby-badges">
        {mine && <span className="badge badge-you">{T.online.you}</span>}
        {st.view.host === index && (
          <span className="badge badge-soft">
            <Crown aria-hidden="true" />
            {T.online.host}
          </span>
        )}
        {!connected && !mine && (
          <span className="badge badge-offline">
            <WifiOff aria-hidden="true" />
            {T.online.disconnected}
          </span>
        )}
      </span>
      {host && !mine && (
        <button
          type="button"
          className="icon-btn"
          aria-label={`${T.online.remove}: ${seat.name}`}
          title={T.online.remove}
          onClick={() => void hostControl('remove', seat.id).then((err) => err && showToast(err))}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

export function LobbyScreen() {
  const st = useOnline();
  const [busy, setBusy] = useState(false);
  usePresenceClock();
  if (!st) return null;
  const view = st.view;
  const host = amHost(st);
  const hostName = view.seats[view.host]?.name ?? '';
  const count = view.seats.length;
  const canStart = count >= MIN_SEATS && count <= MAX_SEATS;
  const options: GameOptions = view.settings;
  const change = <K extends keyof GameOptions>(key: K, value: GameOptions[K]) => {
    void changeRoomSettings({ [key]: value } as Partial<RoomSettings>).then((err) => err && showToast(err));
  };
  const addSeat = async () => {
    setBusy(true);
    const err = await addLocalSeat(defaultPlayerName(count));
    setBusy(false);
    if (err) showToast(err);
  };
  const start = async () => {
    setBusy(true);
    const err = await startRoomGame();
    setBusy(false);
    if (err) showToast(err);
  };

  return (
    <main className="setup-screen lobby-screen">
      <OceanArt />
      <section className="setup-card lobby-card" aria-labelledby="lobby-title">
        <header className="lobby-header">
          <div>
            <p className="lobby-eyebrow">{T.online.roomLabel}</p>
            <h1 id="lobby-title" className="lobby-code" aria-label={T.online.room(st.code)}>
              {st.code}
            </h1>
          </div>
          <div className="lobby-invite">
            <p className="field-label">{T.online.invite}</p>
            <p className="lobby-link">{inviteLink(st.code)}</p>
            <div className="lobby-invite-buttons">
              <Button id="lobby-share" label={T.online.share} icon={<Share2 size={16} aria-hidden="true" />} onClick={() => void shareInvite(st.code)} />
              <Button
                id="lobby-copy"
                variant="ghost"
                label={T.online.copy}
                icon={<Copy size={16} aria-hidden="true" />}
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(inviteLink(st.code))
                    .then(() => showToast(T.online.copied))
                    .catch(() => showToast(inviteLink(st.code)))
                }
              />
            </div>
          </div>
          <span className={`link-dot ${st.link === 'offline' ? 'is-off' : ''}`} title={st.link === 'offline' ? T.online.reconnecting : T.online.connected}>
            {st.link === 'offline' ? <WifiOff aria-hidden="true" /> : <Wifi aria-hidden="true" />}
          </span>
        </header>
        <div className="setup-grid lobby-grid">
          <section className="setup-col" aria-label={T.online.seats}>
            <p className="field-label">
              {T.online.seats} <span className="lobby-count">{T.online.seatCount(count, MAX_SEATS)}</span>
            </p>
            <ol className="lobby-seats">
              {view.seats.map((s, i) => (
                <SeatRow key={s.id} st={st} index={i} />
              ))}
            </ol>
            {count < MAX_SEATS && (
              <Button
                id="lobby-add-seat"
                label={T.online.addSeat}
                icon={<UserRound size={16} aria-hidden="true" />}
                reason={busy ? T.online.errors.conflict ?? null : null}
                onClick={() => void addSeat()}
              />
            )}
          </section>
          <section className="setup-col" aria-label={T.online.settings}>
            {!host && <p className="field-hint lobby-host-only">{T.online.hostOnly}</p>}
            <ModeFields options={options} onChange={change} disabled={!host} />
          </section>
          <section className="setup-col" aria-label={T.setup.rules}>
            <RuleToggles options={options} onChange={change} disabled={!host} />
          </section>
        </div>
        <footer className="setup-footer">
          <Button id="lobby-leave" label={T.online.leave} icon={<LogOut size={18} aria-hidden="true" />} onClick={() => void leaveRoom()} />
          {host ? (
            <span className="lobby-start">
              {!canStart && <span className="primary-reason">{T.online.startNeeds(MIN_SEATS)}</span>}
              <Button
                id="lobby-start"
                variant="primary"
                label={T.online.start}
                icon={busy ? <Check size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                reason={canStart ? null : T.online.startNeeds(MIN_SEATS)}
                onClick={() => void start()}
              />
            </span>
          ) : (
            <p className="lobby-waiting">{T.online.waitingForHost(hostName)}</p>
          )}
        </footer>
      </section>
    </main>
  );
}
