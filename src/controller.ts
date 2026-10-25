import { BridgeClient, type ServerMsg } from './bridge';
import { Screen, SCREEN_RE } from './screen';
import { Stt } from './stt';
import { Tts } from './tts';
import { set, store } from './state';

const SENTENCE_END = /([.!?]+["')\]]*)(\s+|$)/;

export class Controller {
  private tts = new Tts();
  private client = new BridgeClient((m) => this.onServer(m), (online) => set({ online }));
  private stt = new Stt({
    onWakeHeard: () => this.listening(),
    onCommand: (text) => this.ask(text),
    onCancelled: () => { if (store.state === 'listening') set({ state: 'idle' }); },
    onError: (code) => this.onSttError(code),
  });
  private screen = new Screen();
  private pending = '';
  private streamDone = true;
  private noticeTimer?: number;
  async start(): Promise<void> {
    this.tts.onStart = () => {
      this.stt.pause();
      set({ state: 'speaking' });
    };
    this.tts.onIdle = () => {
      if (!this.streamDone) return void set({ state: 'thinking' });
      set({ state: 'idle' });
      this.stt.resume();
    };
    this.screen.onChange = (screenShared) => {
      set({ screenShared });
      this.notify(screenShared ? 'Screen sharing on. Ask me what is on your screen.' : 'Screen sharing off.');
    };
    await this.tts.init();
    set({ elevenlabs: this.tts.elevenlabs });
    this.client.connect();
    this.stt.start();
    this.bindKeys();
    const tick = () => {
      // Direct write: the ring reads this every frame, no need to notify subscribers.
      store.level = store.state === 'speaking' ? this.tts.level() : 0;
      requestAnimationFrame(tick);
    };
    tick();
  }

  notify(message: string, ms = 4000): void {
    set({ notice: message });
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => set({ notice: '' }), ms);
  }

  say(text: string): void {
    this.streamDone = true;
    set({ answer: text });
    this.tts.speak(text);
  }

  private listening(): void {
    this.interrupt();
    set({ state: 'listening' });
  }

  private interrupt(): void {
    this.tts.stop();
    this.client.cancel();
    this.pending = '';
    this.streamDone = true;
  }

  async ask(text: string): Promise<void> {
    this.interrupt();
    set({ question: text, answer: '', state: 'thinking', activeTool: '' });
    this.streamDone = false;
    let image: string | undefined;
    if (SCREEN_RE.test(text)) {
      image = this.screen.grab() ?? undefined;
      if (!image) {
        return this.say("I shall need your permission to see your screen first, sir. Press S, choose a window, and ask me again.");
      }
      set({ activeTool: 'screen' });
    }
    if (!this.client.ask(text, image)) this.say("I'm afraid I can't reach my bridge, sir. Is it running?");
  }

  private onServer(m: ServerMsg): void {
    switch (m.type) {
      case 'hello':
        set({ tools: m.tools, provider: m.provider ?? '', elevenlabs: this.tts.elevenlabs || m.elevenlabs });
        break;
      case 'text':
        set({ answer: store.answer + m.delta });
        this.pending += m.delta;
        this.flushSentences(false);
        break;
      case 'panel':
        if (m.panel === 'calendar') set({ calendar: m.data });
        break;
      case 'tool':
        set({ activeTool: m.name });
        break;
      case 'done':
        this.flushSentences(true);
        this.streamDone = true;
        if (!this.tts.busy) { set({ state: 'idle' }); this.stt.resume(); }
        break;
      case 'error':
        this.say(m.message);
        break;
    }
  }

  private flushSentences(all: boolean): void {
    for (;;) {
      const m = SENTENCE_END.exec(this.pending);
      if (!m || (!all && m.index + m[0].length >= this.pending.length && !m[2])) break;
      const end = m.index + m[0].length;
      this.tts.speak(this.pending.slice(0, end));
      this.pending = this.pending.slice(end);
    }
    if (all && this.pending.trim()) this.tts.speak(this.pending);
    if (all) this.pending = '';
  }

  private onSttError(code: string): void {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      this.notify('Microphone blocked. Allow mic access for this page, then reload.', 8000);
    } else if (code === 'unsupported') {
      this.notify('Speech recognition needs Chrome or Edge. Push-to-talk is unavailable.', 8000);
    } else if (code === 'network') {
      this.notify('Speech recognition lost its network connection.');
    }
  }

  private bindKeys(): void {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.matches?.('input, textarea, [contenteditable]');
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.interrupt();
        set({ state: 'listening' });
        this.stt.pttDown();
      } else if (e.code === 'KeyV' && !e.repeat && !e.metaKey && !e.ctrlKey) {
        this.notify(this.tts.cycleVoice());
      } else if (e.code === 'KeyS' && !e.repeat && !e.metaKey && !e.ctrlKey) {
        if (this.screen.active) this.screen.disable(); else void this.screen.enable();
      } else if (e.code === 'Escape') {
        this.interrupt();
        set({ state: 'idle' });
        this.stt.resume();
      }
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Space' && !typing(e)) { e.preventDefault(); this.stt.pttUp(); }
    });
  }
}
