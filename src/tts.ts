/** Speech output: ElevenLabs via the bridge when available, else the browser's speechSynthesis. */
export class Tts {
  elevenlabs = false;
  private queue: Promise<Blob | null>[] = [];
  private texts: string[] = [];
  private playing = false;
  private audio = new Audio();
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  private synthLevelUntil = 0;
  private voices: SpeechSynthesisVoice[] = [];
  private voiceIndex = 0;
  private generation = 0;
  onIdle: () => void = () => {};
  onStart: () => void = () => {};

  constructor() {
    this.audio.crossOrigin = 'anonymous';
    const load = () => {
      this.voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
      const gb = this.voices.findIndex((v) => /en-GB/i.test(v.lang) && /male|daniel|george|ryan/i.test(v.name));
      if (gb >= 0 && this.voiceIndex === 0) this.voiceIndex = gb;
    };
    if ('speechSynthesis' in window) {
      load();
      speechSynthesis.addEventListener('voiceschanged', load);
    }
  }

  async init(): Promise<void> {
    try {
      const h = await (await fetch('/health')).json();
      this.elevenlabs = Boolean(h.elevenlabs);
    } catch {
      this.elevenlabs = false;
    }
  }

  get busy(): boolean {
    return this.playing || this.queue.length > 0;
  }

  speak(text: string): void {
    const clean = text.replace(/[*_`#>]/g, '').trim();
    if (!clean) return;
    this.texts.push(clean);
    // Prefetch audio now so consecutive sentences play without gaps.
    this.queue.push(this.elevenlabs ? this.fetchAudio(clean) : Promise.resolve(null));
    if (!this.playing) void this.pump();
  }

  stop(): void {
    this.generation++;
    this.queue = [];
    this.texts = [];
    this.audio.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.playing = false;
  }

  /** 0..1 output level for the HUD ring. */
  level(): number {
    if (this.analyser && this.bins && this.playing && this.elevenlabs) {
      this.analyser.getByteFrequencyData(this.bins);
      let sum = 0;
      for (const b of this.bins) sum += b;
      return Math.min(1, (sum / this.bins.length / 255) * 2.4);
    }
    // speechSynthesis exposes no audio; approximate a speaking envelope.
    if (this.playing && performance.now() < this.synthLevelUntil) {
      const t = performance.now() / 1000;
      return 0.35 + 0.25 * Math.abs(Math.sin(t * 9)) + 0.15 * Math.abs(Math.sin(t * 3.7));
    }
    return 0;
  }

  /** Cycle browser voices (V key). Only affects the speechSynthesis fallback. */
  cycleVoice(): string {
    if (this.elevenlabs) return 'ElevenLabs voice is set by JARVIS_VOICE_ID';
    if (!this.voices.length) return 'No browser voices available';
    this.voiceIndex = (this.voiceIndex + 1) % this.voices.length;
    const v = this.voices[this.voiceIndex];
    this.stop();
    this.speak('At your service, sir.');
    return `Voice: ${v.name} (${v.lang})`;
  }

  private async fetchAudio(text: string): Promise<Blob | null> {
    try {
      const res = await fetch('/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  private async pump(): Promise<void> {
    const gen = this.generation;
    this.playing = true;
    this.onStart();
    while (this.queue.length && gen === this.generation) {
      const blobP = this.queue.shift()!;
      const text = this.texts.shift()!;
      const blob = await blobP;
      if (gen !== this.generation) return;
      if (blob) await this.playBlob(blob);
      else await this.playSynth(text);
    }
    if (gen !== this.generation) return;
    this.playing = false;
    this.onIdle();
  }

  private ensureAnalyser(): void {
    if (this.analyser) return;
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaElementSource(this.audio);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    src.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      try { this.ensureAnalyser(); void this.ctx?.resume(); } catch { /* level falls back to 0 */ }
      const done = () => { URL.revokeObjectURL(url); resolve(); };
      this.audio.onended = done;
      this.audio.onerror = done;
      this.audio.src = url;
      this.audio.play().catch(done);
    });
  }

  private playSynth(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voices[this.voiceIndex];
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
      u.rate = 1.02;
      this.synthLevelUntil = performance.now() + text.length * 70 + 1500;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
}
