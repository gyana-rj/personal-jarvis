import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createBridge } from '../bridge/server.mjs';
import { createTts } from '../bridge/tts.mjs';
import { parseImage } from '../bridge/agent.mjs';

let bridge, port;
beforeAll(async () => {
  bridge = createBridge({ tts: createTts({}), agent: { serverNames: ['calendar'], run: async () => 's' } });
  port = await bridge.listen();
});
afterAll(() => bridge.close());

describe('bridge HTTP', () => {
  it('/health reports ElevenLabs availability', async () => {
    const r = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    expect(r).toEqual({ ok: true, elevenlabs: false, tools: ['calendar'] });
  });
  it('/tts returns a browser-fallback signal when unavailable', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/tts`, { method: 'POST', body: '{"text":"hi"}' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ fallback: 'browser' });
  });
  it('rejects foreign origins', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });
  it('listens on loopback only', () => {
    expect(bridge.server.address().address).toBe('127.0.0.1');
  });
});

describe('parseImage', () => {
  it('accepts base64 image data URLs and rejects anything else', () => {
    expect(parseImage('data:image/png;base64,AAAA')).toMatchObject({ type: 'image' });
    expect(parseImage('data:text/html;base64,AAAA')).toBeNull();
    expect(parseImage('https://x/y.png')).toBeNull();
  });
});
