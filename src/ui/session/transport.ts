// The live connection to an online room (spec section 17). Server-Sent Events are read with fetch,
// so the same code runs in browsers and in tests:
// - every reconnect resumes from the last version received, so nothing is missed or repeated;
// - the stream ends before the platform's time limit and is reopened at once;
// - a watchdog treats a silent stream (the server pings every 20 s) as broken;
// - when the stream fails, or ends within seconds of opening, it polls every 2 s and tries the
//   stream again now and then, so a server that cannot stream is never hit in a loop;
// - resync() fetches what was missed at once (the tab became visible, a heartbeat saw a newer version).
// Chat (spec section 18) rides the same connection with its own cursor, so it is never repeated.
import type { ChatMessage, RoomUpdate, RoomView, VoicePeer } from '../../online/protocol';

export type LinkStatus = 'connecting' | 'live' | 'polling' | 'offline' | 'gone';

export interface TransportHandlers {
  /** New versions, oldest first, and the room after the last one (entries may be empty: a snapshot). */
  updates(entries: RoomUpdate[], view: RoomView): void;
  status(status: LinkStatus): void;
  /** New chat messages, oldest first, each once. */
  chat?(messages: ChatMessage[]): void;
  /** Who is in voice chat now. */
  voice?(peers: VoicePeer[]): void;
  /** A voice set-up message for `to` arrived (its content is fetched by the receiver). */
  signal?(to: string, id: number): void;
}

export interface TransportOptions {
  /** Origin of the API ('' = same origin). */
  base?: string;
  pollMs?: number;
  /** No data for this long means the stream is dead (the server pings every 20 s). */
  silenceMs?: number;
  /** While polling, try the stream again after this long. */
  streamRetryMs?: number;
  /** A stream that ends sooner than this after opening counts as failing. */
  minStreamMs?: number;
  fetch?: typeof fetch;
}

interface Frame {
  event: string;
  data: string;
}

/** Reads an SSE body, calling `frame` for each event and `alive` for any bytes (pings included). */
export async function readEvents(
  body: ReadableStream<Uint8Array>,
  frame: (f: Frame) => void,
  alive: () => void,
  onReader: (reader: ReadableStreamDefaultReader<Uint8Array>) => void = () => undefined,
): Promise<void> {
  const reader = body.getReader();
  onReader(reader);
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    alive();
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data.push(line.slice(6));
      }
      if (data.length > 0) frame({ event, data: data.join('\n') });
    }
  }
}

export class RoomTransport {
  private version: number;
  /** The newest chat message id received. */
  private chatAfter = 0;
  private running = false;
  private mode: 'stream' | 'poll' = 'stream';
  private streamAbort: AbortController | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: RoomUpdate[] = [];
  private current: LinkStatus = 'connecting';
  private readonly base: string;
  private readonly pollMs: number;
  private readonly silenceMs: number;
  private readonly streamRetryMs: number;
  private readonly minStreamMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly code: string,
    version: number,
    private readonly handlers: TransportHandlers,
    options: TransportOptions = {},
  ) {
    this.version = version;
    this.base = options.base ?? '';
    this.pollMs = options.pollMs ?? 2000;
    this.silenceMs = options.silenceMs ?? 45_000;
    this.streamRetryMs = options.streamRetryMs ?? 30_000;
    this.minStreamMs = options.minStreamMs ?? 5000;
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
  }

  get status(): LinkStatus {
    return this.current;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.mode = 'stream';
    void this.streamLoop();
  }

  stop(): void {
    this.running = false;
    this.streamAbort?.abort();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pollTimer = null;
    this.retryTimer = null;
  }

  /** The session already has this version (from its own action's answer). */
  advance(version: number): void {
    if (version > this.version) this.version = version;
  }

  /** Chat this session already has (messages sent from here arrive in the server's answer). */
  advanceChat(id: number): void {
    if (id > this.chatAfter) this.chatAfter = id;
  }

  private deliverChat(messages: ChatMessage[]): void {
    const fresh = messages.filter((m) => m.id > this.chatAfter).sort((a, b) => a.id - b.id);
    if (fresh.length === 0) return;
    this.chatAfter = (fresh[fresh.length - 1] as ChatMessage).id;
    this.handlers.chat?.(fresh);
  }

  /** Asks the server for anything missed, now. */
  async resync(): Promise<void> {
    if (!this.running) return;
    await this.pollOnce();
  }

  private setStatus(status: LinkStatus): void {
    if (status === this.current) return;
    this.current = status;
    this.handlers.status(status);
  }

  private deliver(entries: RoomUpdate[], view: RoomView): void {
    const fresh = entries.filter((e) => e.v > this.version);
    if (view.version < this.version) return;
    if (fresh.length === 0 && view.version === this.version) return;
    this.version = view.version;
    this.handlers.updates(fresh, view);
  }

  private onFrame(frame: Frame): void {
    if (frame.event === 'update') {
      const update = JSON.parse(frame.data) as RoomUpdate;
      if (update.v <= this.version) return;
      // A catch-up batch carries the view only on its last entry.
      this.pending.push(update);
      if (update.view) {
        const batch = this.pending;
        this.pending = [];
        this.deliver(batch, update.view);
      }
    } else if (frame.event === 'snapshot') {
      const snap = JSON.parse(frame.data) as { v: number; view: RoomView };
      this.pending = [];
      this.deliver([], snap.view);
    } else if (frame.event === 'chat') {
      this.deliverChat((JSON.parse(frame.data) as { messages: ChatMessage[] }).messages);
    } else if (frame.event === 'voice') {
      this.handlers.voice?.((JSON.parse(frame.data) as { peers: VoicePeer[] }).peers);
    } else if (frame.event === 'signal') {
      const n = JSON.parse(frame.data) as { to: string; id: number };
      this.handlers.signal?.(n.to, n.id);
    }
  }

  private async streamLoop(): Promise<void> {
    while (this.running && this.mode === 'stream') {
      const controller = new AbortController();
      this.streamAbort = controller;
      let lastData = Date.now();
      let silent = false;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      const watchdog = setInterval(() => {
        if (Date.now() - lastData <= this.silenceMs) return;
        silent = true;
        controller.abort();
        void reader?.cancel().catch(() => undefined);
      }, Math.min(5000, this.silenceMs));
      try {
        this.pending = [];
        const res = await this.fetchFn(`${this.base}/api/stream?code=${this.code}&since=${this.version}&chat=${this.chatAfter}`, {
          signal: controller.signal,
          headers: { accept: 'text/event-stream' },
          cache: 'no-store',
        });
        if (res.status === 404) {
          this.gone();
          return;
        }
        if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
        this.setStatus('live');
        const opened = Date.now();
        await readEvents(
          res.body,
          (f) => this.onFrame(f),
          () => {
            lastData = Date.now();
          },
          (r) => {
            reader = r;
          },
        );
        if (silent) throw new Error('silent stream');
        // Ending at once means the server cannot stream (it could not listen): poll instead.
        if (Date.now() - opened < this.minStreamMs) throw new Error('stream ended early');
        // The response ended (time limit): reopen at once from the last version.
      } catch {
        if (!this.running) return;
        // Broken or blocked stream: poll, and try the stream again later.
        this.mode = 'poll';
        this.startPolling();
        return;
      } finally {
        clearInterval(watchdog);
      }
    }
  }

  private startPolling(): void {
    if (!this.running) return;
    const tick = async () => {
      if (!this.running || this.mode !== 'poll') return;
      await this.pollOnce();
      if (this.running && this.mode === 'poll') this.pollTimer = setTimeout(tick, this.pollMs);
    };
    void tick();
    this.retryTimer = setTimeout(() => {
      if (!this.running || this.mode !== 'poll') return;
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this.mode = 'stream';
      void this.streamLoop();
    }, this.streamRetryMs);
  }

  private async pollOnce(): Promise<void> {
    try {
      const res = await this.fetchFn(`${this.base}/api/room?code=${this.code}&since=${this.version}&chat=${this.chatAfter}&voice=1`, { cache: 'no-store' });
      if (res.status === 404) {
        this.gone();
        return;
      }
      if (!res.ok) throw new Error(`poll HTTP ${res.status}`);
      const body = (await res.json()) as {
        view: RoomView;
        updates: RoomUpdate[] | null;
        chat?: { last: number; messages: ChatMessage[] };
        voice?: VoicePeer[];
      };
      this.deliver(body.updates ?? [], body.view);
      if (body.chat) this.deliverChat(body.chat.messages);
      if (body.voice) this.handlers.voice?.(body.voice);
      if (this.mode === 'poll') this.setStatus('polling');
    } catch {
      if (this.running) this.setStatus('offline');
    }
  }

  private gone(): void {
    this.stop();
    this.setStatus('gone');
  }
}
