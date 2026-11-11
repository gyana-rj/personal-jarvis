import type { CalendarPanelData } from './state';

export type ServerMsg =
  | { type: 'hello'; elevenlabs: boolean; tools: string[]; provider?: string }
  | { type: 'text'; delta: string }
  | { type: 'panel'; panel: string; data: CalendarPanelData }
  | { type: 'tool'; name: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export class BridgeClient {
  private ws?: WebSocket;
  private retry = 500;

  constructor(
    private onMessage: (m: ServerMsg) => void,
    private onStatus: (online: boolean) => void,
  ) {}

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 500; this.onStatus(true); };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = () => {
      this.onStatus(false);
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 8000);
    };
  }

  ask(text: string, image?: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type: 'ask', text, image }));
    return true;
  }

  cancel(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'cancel' }));
  }
}
