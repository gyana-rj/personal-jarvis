import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import WebSocket from 'ws';
import { createBridge } from '../bridge/server.mjs';
import { createTts } from '../bridge/tts.mjs';
import { RateLimitError, RATE_LIMIT_MESSAGE } from '../bridge/llm/types.ts';

let bridge, port, nextError;
beforeAll(async () => {
  const agent = { serverNames: [], provider: 'mock', run: async ({ onText }) => { if (nextError) throw nextError; onText('Hello, sir.'); } };
  bridge = createBridge({ tts: createTts({}), agent });
  port = await bridge.listen();
});
afterAll(() => bridge.close());

const ask = (text) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const got = [];
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); got.push(m); if (m.type === 'done' || m.type === 'error') { ws.close(); resolve(got); } });
  ws.on('open', () => ws.send(JSON.stringify({ type: 'ask', text })));
});

describe('bridge turn errors', () => {
  it('announces the provider in hello and streams text', async () => {
    nextError = undefined;
    const msgs = await ask('hi');
    expect(msgs[0]).toMatchObject({ type: 'hello', provider: 'mock' });
    expect(msgs.map((m) => m.type)).toEqual(['hello', 'text', 'done']);
  });
  it('says the rate-limit line after retries are exhausted', async () => {
    nextError = new RateLimitError('x');
    const msgs = await ask('hi');
    expect(msgs.at(-1)).toEqual({ type: 'error', message: RATE_LIMIT_MESSAGE });
    expect(RATE_LIMIT_MESSAGE).toBe("I'm being rate-limited, sir. Give me a moment.");
  });
  it('points at the API key on auth failures without leaking provider text', async () => {
    nextError = Object.assign(new Error('API key not valid: AIzaSECRET'), { status: 400 });
    const msg = (await ask('hi')).at(-1);
    expect(msg.message).toMatch(/API key/);
    expect(msg.message).not.toContain('AIzaSECRET');
  });
  it('falls back to a generic apology', async () => {
    nextError = new Error('kaboom');
    expect((await ask('hi')).at(-1).message).toMatch(/lost my train of thought/);
  });
});
