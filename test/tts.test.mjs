import { describe, it, expect, vi } from 'vitest';
import { createTts } from '../bridge/tts.mjs';

describe('createTts', () => {
  it('is unavailable and signals browser fallback without keys', async () => {
    const fetchImpl = vi.fn();
    const tts = createTts({ apiKey: '', voiceId: 'v', fetchImpl });
    expect(tts.available).toBe(false);
    expect(await tts.synth('hi')).toMatchObject({ ok: false, status: 503, fallback: 'browser' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('is unavailable without a voice id', () => {
    expect(createTts({ apiKey: 'k' }).available).toBe(false);
  });
  it('proxies audio using the voice id and keeps the key in the header only', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const tts = createTts({ apiKey: 'secret', voiceId: 'voice123', fetchImpl });
    const out = await tts.synth('Good morning, sir.');
    expect(out.ok).toBe(true);
    expect(out.audio.length).toBe(3);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/voice123');
    expect(url).not.toContain('secret');
    expect(init.headers['xi-api-key']).toBe('secret');
  });
  it('falls back to browser on upstream error or network failure', async () => {
    const bad = createTts({ apiKey: 'k', voiceId: 'v', fetchImpl: async () => new Response('no', { status: 401 }) });
    expect(await bad.synth('hi')).toMatchObject({ ok: false, fallback: 'browser' });
    const down = createTts({ apiKey: 'k', voiceId: 'v', fetchImpl: async () => { throw new Error('net'); } });
    expect(await down.synth('hi')).toMatchObject({ ok: false, fallback: 'browser' });
  });
  it('rejects empty text', async () => {
    expect(await createTts({ apiKey: 'k', voiceId: 'v' }).synth('  ')).toMatchObject({ ok: false, status: 400 });
  });
});
