// Voice chat controls (spec section 18), online only: Join voice; once in, the microphone switch
// (it lights while you talk) and Leave voice. On phones a single button in the status bar joins and
// then mutes; Leave voice is in the menu. Badges on player cards and lobby rows show who is in
// voice, talking or muted.
import { AudioLines, Headphones, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useState } from 'react';
import { useOnline } from '../session/online';
import { joinVoice, leaveVoice, peerForSeat, setVoiceMuted, useVoice } from '../session/voice';
import { showToast } from '../store';
import { T } from '../strings';

export function VoiceButton({ compact = false }: { compact?: boolean }) {
  const v = useVoice();
  const st = useOnline();
  const [busy, setBusy] = useState(false);
  if (!st) return null;
  const others = v.peers.filter((p) => p.id !== v.me).length;
  if (v.status !== 'on') {
    const joining = v.status === 'joining' || busy;
    const label = joining ? T.voice.joining : T.voice.join;
    return (
      <button
        type="button"
        id="voice-join"
        className={`btn btn-ghost voice-btn ${compact ? 'is-compact' : ''}`}
        data-no-skip=""
        aria-busy={joining || undefined}
        aria-label={others > 0 ? `${label}. ${T.voice.inVoice(others)}` : label}
        title={others > 0 ? T.voice.inVoice(others) : label}
        onClick={async () => {
          if (joining) return;
          setBusy(true);
          const err = await joinVoice();
          setBusy(false);
          showToast(err ?? T.voice.hint);
        }}
      >
        {joining ? <Loader2 className="spinner" size={16} aria-hidden="true" /> : <Headphones size={16} aria-hidden="true" />}
        {!compact && <span className="btn-label tb-label">{label}</span>}
        {others > 0 && (
          <span className="voice-count" aria-hidden="true">
            {others}
          </span>
        )}
      </button>
    );
  }
  const talking = v.me !== null && v.speaking.includes(v.me);
  return (
    <span className="voice-controls" data-no-skip="">
      <button
        type="button"
        id="voice-mute"
        className={`btn btn-ghost voice-btn ${v.muted ? 'is-muted' : ''} ${talking ? 'is-talking' : ''} ${compact ? 'is-compact' : ''}`}
        aria-pressed={v.muted}
        aria-label={T.voice.mute}
        title={v.muted ? T.voice.unmute : T.voice.mute}
        onClick={() => void setVoiceMuted(!v.muted)}
      >
        {v.muted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
        {!compact && <span className="btn-label tb-label">{v.muted ? T.voice.muted : T.voice.micOn}</span>}
      </button>
      {!compact && (
        <button type="button" id="voice-leave" className="icon-btn voice-leave" aria-label={T.voice.leave} title={T.voice.leave} onClick={() => leaveVoice()}>
          <PhoneOff size={16} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** Leave voice, as a menu item (phones keep only the microphone switch in the status bar). */
export function LeaveVoiceItem() {
  const v = useVoice();
  if (v.status !== 'on') return null;
  return (
    <button type="button" id="menu-leave-voice" className="menu-item" data-no-skip="" onClick={() => leaveVoice()}>
      <PhoneOff size={16} aria-hidden="true" />
      {T.voice.leave}
    </button>
  );
}

/** Who is in voice: listening, talking (while this device is in voice and hears them) or muted. */
export function VoiceBadge({ seatId }: { seatId: string | undefined }) {
  const v = useVoice();
  const peer = peerForSeat(v, seatId);
  if (!peer) return null;
  const talking = v.speaking.includes(peer.id);
  const Icon = peer.muted ? MicOff : talking ? AudioLines : Headphones;
  const label = peer.muted ? T.voice.muted : talking ? T.voice.talking : T.voice.listening;
  return (
    <span className={`voice-badge ${talking ? 'is-talking' : ''} ${peer.muted ? 'is-muted' : ''}`} title={label} data-voice-seat={seatId}>
      <Icon aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
