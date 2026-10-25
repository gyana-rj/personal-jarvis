// Web Speech API typings are not in lib.dom.
interface SRResult { isFinal: boolean; 0: { transcript: string } }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SR {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void; stop(): void;
}

export const WAKE_RE = /\bhey,?\s+j\.?\s?a\.?\s?r\.?\s?v\.?\s?i\.?\s?s\b|\bhey,?\s+jarvis\b/i;

/** Text spoken after the wake phrase, or null when the phrase is absent. */
export function afterWake(transcript: string): string | null {
  const m = WAKE_RE.exec(transcript);
  return m ? transcript.slice(m.index + m[0].length).replace(/^[\s,.:;!?-]+/, '').trim() : null;
}

type Mode = 'wake' | 'capture' | 'ptt';

export interface SttHandlers {
  onWakeHeard(): void;
  onCommand(text: string): void;
  onCancelled(): void;
  onError(code: string): void;
}

export class Stt {
  static supported = Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  private rec?: SR;
  private mode: Mode = 'wake';
  private wanted = false;
  private paused = false;
  private armed = false;
  private captureTimer?: number;
  private latest = '';

  constructor(private h: SttHandlers) {}

  start(): void {
    if (!Stt.supported) return h_unsupported(this.h);
    this.wanted = true;
    this.spawn();
  }

  /** Stop listening while JARVIS talks, so he doesn't hear himself. */
  pause(): void { this.paused = true; this.rec?.abort(); }
  resume(): void { this.paused = false; this.reset('wake'); if (this.wanted) this.spawn(); }

  pttDown(): void {
    if (this.mode === 'ptt') return;
    this.mode = 'ptt';
    this.latest = '';
    this.armed = false;
    clearTimeout(this.captureTimer);
    this.rec?.abort(); // fresh session so earlier speech isn't included
    if (this.wanted) this.spawn();
  }

  pttUp(): void {
    if (this.mode !== 'ptt') return;
    // Give the recogniser a moment to deliver its last words.
    window.setTimeout(() => {
      const text = this.latest.trim();
      this.reset('wake');
      this.rec?.abort();
      if (text) this.h.onCommand(text); else this.h.onCancelled();
    }, 450);
  }

  private reset(mode: Mode): void {
    this.mode = mode;
    this.armed = false;
    this.latest = '';
    clearTimeout(this.captureTimer);
  }

  private spawn(): void {
    if (this.rec || this.paused) return;
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec: SR = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-GB';
    rec.onresult = (e) => this.onResult(e);
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.wanted = false;
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.h.onError(e.error);
    };
    rec.onend = () => {
      this.rec = undefined;
      if (this.wanted && !this.paused) window.setTimeout(() => this.spawn(), 250);
    };
    this.rec = rec;
    try { rec.start(); } catch { this.rec = undefined; }
  }

  private onResult(e: SREvent): void {
    let full = '';
    for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript + ' ';
    full = full.trim();
    const last = e.results[e.results.length - 1];

    if (this.mode === 'ptt') { this.latest = full; return; }

    if (this.mode === 'capture') {
      this.latest = full;
      if (last.isFinal) this.finish(full);
      return;
    }

    const cmd = afterWake(full);
    if (cmd === null) return;
    if (!this.armed) { this.armed = true; this.h.onWakeHeard(); }
    if (last.isFinal) {
      if (cmd) return this.finish(cmd);
      // Wake phrase alone: capture the next utterance, give up after a few seconds.
      this.mode = 'capture';
      this.rec?.abort();
      this.captureTimer = window.setTimeout(() => { this.reset('wake'); this.h.onCancelled(); }, 7000);
    }
  }

  private finish(text: string): void {
    this.reset('wake');
    this.rec?.abort();
    this.h.onCommand(text);
  }
}

function h_unsupported(h: SttHandlers): void {
  h.onError('unsupported');
}
