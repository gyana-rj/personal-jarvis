const MAX_EDGE = 1568; // larger frames are downscaled by the model anyway; keep uploads small

/**
 * Screen Capture API. getDisplayMedia needs a user gesture, so the person grants it once
 * (press S) and we keep the stream to grab frames when they later ask by voice.
 */
export class Screen {
  private stream?: MediaStream;
  private video = document.createElement('video');
  onChange: (shared: boolean) => void = () => {};

  get active(): boolean {
    return Boolean(this.stream?.active);
  }

  async enable(): Promise<boolean> {
    if (this.active) return true;
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return false;
    }
    this.video.srcObject = this.stream;
    this.video.muted = true;
    await this.video.play();
    this.stream.getVideoTracks()[0].addEventListener('ended', () => { this.stream = undefined; this.onChange(false); });
    this.onChange(true);
    return true;
  }

  disable(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.onChange(false);
  }

  /** Current frame as a JPEG data URL, or null if sharing is off. */
  grab(): string | null {
    if (!this.active || !this.video.videoWidth) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(this.video.videoWidth, this.video.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(this.video.videoWidth * scale);
    c.height = Math.round(this.video.videoHeight * scale);
    c.getContext('2d')!.drawImage(this.video, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }
}

export const SCREEN_RE = /\b(what'?s|what is|what do you see)\b.*\b(on )?(my |the )?screen\b|\b(look at|read|describe) (my|the) screen\b/i;
