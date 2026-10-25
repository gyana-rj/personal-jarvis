import { describe, it, expect, vi } from 'vitest';
import { GeminiProvider, toContents } from '../bridge/llm/providers/gemini.ts';
import { RateLimitError } from '../bridge/llm/types.ts';

const err429 = () => Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
async function* stream(chunks) { for (const c of chunks) yield c; }
const parts = (...p) => ({ candidates: [{ content: { role: 'model', parts: p } }] });
const collect = async (it) => { const out = []; for await (const c of it) out.push(c); return out; };
const noSleep = { sleep: async () => {}, baseMs: 1 };

describe('GeminiProvider.stream', () => {
  it('maps streamed parts to text / tool_call chunks and returns raw content with signatures', async () => {
    const generateContentStream = vi.fn(async () =>
      stream([
        parts({ thought: true, text: 'thinking...' }),
        parts({ text: 'Let me look, sir. ' }),
        parts({ functionCall: { id: 'c1', name: 'web_search', args: { query: 'x' } }, thoughtSignature: 'SIG' }),
      ]),
    );
    const p = new GeminiProvider({ client: { models: { generateContentStream, generateContent: vi.fn() } }, retry: noSleep });
    const tool = { name: 'web_search', description: 'search', parameters: { type: 'object', properties: { query: { type: 'string' } } }, execute: async () => '' };
    const chunks = await collect(p.stream([{ role: 'user', text: 'hi' }], [tool]));

    expect(chunks.slice(0, 2)).toEqual([
      { type: 'text', text: 'Let me look, sir. ' },
      { type: 'tool_call', call: { id: 'c1', name: 'web_search', args: { query: 'x' } } },
    ]);
    const done = chunks.at(-1);
    expect(done.type).toBe('done');
    expect(done.raw.parts.find((x) => x.functionCall).thoughtSignature).toBe('SIG');

    const req = generateContentStream.mock.calls[0][0];
    expect(req.model).toBe('gemini-3.8-flash');
    expect(req.config.systemInstruction).toMatch(/J\.A\.R\.V\.I\.S\./);
    expect(req.config.tools[0].functionDeclarations[0]).toMatchObject({ name: 'web_search', parameters: { type: 'OBJECT' } });
  });

  it('retries a 429 up to 3 times then succeeds', async () => {
    let n = 0;
    const generateContentStream = vi.fn(async () => { if (++n <= 3) throw err429(); return stream([parts({ text: 'Back, sir.' })]); });
    const p = new GeminiProvider({ client: { models: { generateContentStream, generateContent: vi.fn() } }, retry: noSleep });
    const chunks = await collect(p.stream([{ role: 'user', text: 'hi' }], []));
    expect(chunks[0]).toEqual({ type: 'text', text: 'Back, sir.' });
    expect(generateContentStream).toHaveBeenCalledTimes(4);
  });

  it('throws RateLimitError once retries are exhausted (the bridge turns it into the butler line)', async () => {
    const generateContentStream = vi.fn(async () => { throw err429(); });
    const p = new GeminiProvider({ client: { models: { generateContentStream, generateContent: vi.fn() } }, retry: noSleep });
    await expect(collect(p.stream([{ role: 'user', text: 'hi' }], []))).rejects.toBeInstanceOf(RateLimitError);
    expect(generateContentStream).toHaveBeenCalledTimes(4);
  });

  it('retries a 429 delivered as the first stream read', async () => {
    let n = 0;
    const generateContentStream = vi.fn(async () => {
      if (++n === 1) return (async function* () { throw err429(); })();
      return stream([parts({ text: 'ok' })]);
    });
    const p = new GeminiProvider({ client: { models: { generateContentStream, generateContent: vi.fn() } }, retry: noSleep });
    expect((await collect(p.stream([{ role: 'user', text: 'hi' }], [])))[0]).toEqual({ type: 'text', text: 'ok' });
  });
});

describe('toContents', () => {
  it('sends screenshots as inline image data before the text', () => {
    const c = toContents([{ role: 'user', text: "What's on my screen?", image: { mimeType: 'image/jpeg', data: 'AAAA' } }]);
    expect(c).toEqual([{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }, { text: "What's on my screen?" }] }]);
  });
  it('replays raw model content and maps tool results to functionResponse parts', () => {
    const raw = { role: 'model', parts: [{ functionCall: { id: '1', name: 't', args: {} }, thoughtSignature: 'S' }] };
    const c = toContents([
      { role: 'user', text: 'q' },
      { role: 'assistant', text: '', toolCalls: [{ id: '1', name: 't', args: {} }], raw },
      { role: 'tool', results: [{ id: '1', name: 't', output: 'v' }, { id: '2', name: 'u', output: 'bad', isError: true }] },
    ]);
    expect(c[1]).toBe(raw);
    expect(c[2].parts.map((p) => p.functionResponse.response)).toEqual([{ output: 'v' }, { error: 'bad' }]);
  });
});

describe('web_search', () => {
  it('makes a separate grounded call and returns summary + de-duplicated sources', async () => {
    const generateContent = vi.fn(async () => ({
      candidates: [{
        content: { parts: [{ text: 'Rain tomorrow. ' }, { text: 'Bring a coat.' }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a.example', title: 'A' } }, { web: { uri: 'https://a.example', title: 'A again' } }, { web: { uri: 'https://b.example', title: 'B' } }] },
      }],
    }));
    const p = new GeminiProvider({ client: { models: { generateContentStream: vi.fn(), generateContent } }, retry: noSleep });
    const [tool] = p.builtinTools();
    expect(tool.name).toBe('web_search');
    const out = JSON.parse(await tool.execute({ query: 'weather london' }));
    expect(out).toEqual({ summary: 'Rain tomorrow. Bring a coat.', sources: [{ title: 'A', url: 'https://a.example' }, { title: 'B', url: 'https://b.example' }] });
    const req = generateContent.mock.calls[0][0];
    expect(req.model).toBe('gemini-2.5-flash'); // free-tier grounding model, separate from the chat model
    expect(req.config.tools).toEqual([{ googleSearch: {} }]);
  });
});
