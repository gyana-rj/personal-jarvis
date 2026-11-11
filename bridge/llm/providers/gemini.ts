import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from '../../prompt.mjs';
import { toFunctionDeclaration } from '../schema';
import { withRateLimitRetry, type RetryOptions } from '../retry';
import type { Chunk, ImageData, LLMProvider, Message, Tool } from '../types';

/** Current stable Flash model per https://ai.google.dev/gemini-api/docs/models (free tier). */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
/**
 * Model used for the separate Google-Search-grounded call behind `web_search`.
 * Grounding is free on gemini-2.5-flash (500 requests/day) but paid-only on Gemini 3.x,
 * so the default keeps a free key fully working.
 */
export const DEFAULT_SEARCH_MODEL = 'gemini-2.5-flash';

const SEARCH_INSTRUCTION =
  'Answer the question factually and concisely from current web results, in at most five sentences. Plain text only, no markdown.';

type Part = Record<string, any>;
type Content = { role: 'user' | 'model'; parts: Part[] };

/** Structural subset of GoogleGenAI that the provider uses (lets tests inject a fake). */
export interface GenAIClient {
  models: {
    generateContentStream(params: any): Promise<AsyncIterable<any>>;
    generateContent(params: any): Promise<any>;
  };
}

export interface GeminiOptions {
  apiKey?: string;
  model?: string;
  searchModel?: string;
  client?: GenAIClient;
  retry?: Pick<RetryOptions, 'retries' | 'baseMs' | 'sleep'>;
}

const imagePart = (img: ImageData): Part => ({ inlineData: { mimeType: img.mimeType, data: img.data } });

export function toContents(messages: Message[]): Content[] {
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [...(m.image ? [imagePart(m.image)] : []), { text: m.text }] });
    } else if (m.role === 'assistant') {
      // Replay Gemini's own content verbatim when we have it: it carries thought signatures.
      const raw = m.raw as Content | undefined;
      if (raw?.parts?.length) {
        contents.push(raw);
        continue;
      }
      const parts: Part[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const c of m.toolCalls ?? []) parts.push({ functionCall: { id: c.id, name: c.name, args: c.args } });
      if (parts.length) contents.push({ role: 'model', parts });
    } else {
      contents.push({
        role: 'user',
        parts: m.results.map((r) => ({
          functionResponse: { id: r.id, name: r.name, response: r.isError ? { error: r.output } : { output: r.output } },
        })),
      });
    }
  }
  return contents;
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly searchModel: string;
  private readonly ai: GenAIClient;
  private readonly retry: GeminiOptions['retry'];

  constructor(opts: GeminiOptions) {
    this.model = opts.model ?? DEFAULT_GEMINI_MODEL;
    this.searchModel = opts.searchModel ?? DEFAULT_SEARCH_MODEL;
    this.retry = opts.retry;
    // The key stays in this process; it is never sent to the browser.
    this.ai = opts.client ?? (new GoogleGenAI({ apiKey: opts.apiKey }) as unknown as GenAIClient);
  }

  /** web_search = a separate grounded Gemini call, returning a summary plus source URLs. */
  builtinTools(): Tool[] {
    return [
      {
        name: 'web_search',
        description: 'Search the web (Google Search) for current information, news, weather, or facts. Returns a short summary and source URLs.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'What to search for, phrased as a question or keywords.' } },
          required: ['query'],
        },
        execute: (args, signal) => this.webSearch(String(args.query ?? ''), signal),
      },
    ];
  }

  async webSearch(query: string, signal?: AbortSignal): Promise<string> {
    if (!query.trim()) return JSON.stringify({ error: 'empty query' });
    const res = await withRateLimitRetry(
      () =>
        this.ai.models.generateContent({
          model: this.searchModel,
          contents: query,
          config: { systemInstruction: SEARCH_INSTRUCTION, tools: [{ googleSearch: {} }], abortSignal: signal },
        }),
      { ...this.retry, signal },
    );
    const parts: Part[] = res?.candidates?.[0]?.content?.parts ?? [];
    const summary = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
    const chunks: any[] = res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources = chunks
      .map((c) => c?.web)
      .filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
      .slice(0, 5)
      .map((w) => ({ title: w.title ?? '', url: w.uri }));
    return JSON.stringify({ summary: summary || 'No results found.', sources });
  }

  async *stream(messages: Message[], tools: Tool[], signal?: AbortSignal): AsyncIterable<Chunk> {
    const config: Record<string, unknown> = { systemInstruction: SYSTEM_PROMPT, abortSignal: signal };
    if (tools.length) config.tools = [{ functionDeclarations: tools.map(toFunctionDeclaration) }];
    const contents = toContents(messages);

    // Free-tier 429s arrive when the request starts: retry (with backoff) until the first chunk is in hand.
    const { it, first } = await withRateLimitRetry(
      async () => {
        const s = await this.ai.models.generateContentStream({ model: this.model, contents, config });
        const iterator = s[Symbol.asyncIterator]();
        return { it: iterator, first: await iterator.next() };
      },
      { ...this.retry, signal },
    );

    const allParts: Part[] = [];
    let n = 0;
    for (let step = first; !step.done; step = await it.next()) {
      for (const part of (step.value?.candidates?.[0]?.content?.parts ?? []) as Part[]) {
        allParts.push(part);
        if (part.functionCall) {
          const fc = part.functionCall;
          yield { type: 'tool_call', call: { id: fc.id ?? `call_${n++}`, name: fc.name, args: fc.args ?? {} } };
        } else if (typeof part.text === 'string' && part.text && !part.thought) {
          yield { type: 'text', text: part.text };
        }
      }
    }
    yield { type: 'done', raw: allParts.length ? ({ role: 'model', parts: allParts } satisfies Content) : undefined };
  }
}
