import { createAgent } from '../../agent.mjs';
import { channel } from '../channel';
import type { Chunk, LLMProvider, Message, Tool } from '../types';

export interface AnthropicOptions {
  model?: string;
  mcpServers: Record<string, unknown>;
}

/**
 * Optional provider wrapping the original Claude Agent SDK logic. The SDK runs its own tool loop
 * (built-in web search/fetch plus the MCP servers), so the bridge hands it the conversation and
 * lets it stream text back.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly managesTools = true;
  private readonly agent: ReturnType<typeof createAgent>;

  constructor(opts: AnthropicOptions) {
    this.model = opts.model ?? 'sdk-default';
    this.agent = createAgent({ mcpServers: opts.mcpServers, model: opts.model });
  }

  async *stream(messages: Message[], _tools: Tool[], signal?: AbortSignal): AsyncIterable<Chunk> {
    const last = [...messages].reverse().find((m) => m.role === 'user');
    if (!last || last.role !== 'user') return;
    // The SDK takes one prompt, so earlier turns ride along as a short transcript.
    const history = messages
      .slice(0, messages.lastIndexOf(last))
      .flatMap((m) => (m.role === 'user' ? [`User: ${m.text}`] : m.role === 'assistant' && m.text ? [`Jarvis: ${m.text}`] : []))
      .slice(-12);
    const text = history.length ? `Earlier in this conversation:\n${history.join('\n')}\n\nUser now says: ${last.text}` : last.text;
    const image = last.image ? `data:${last.image.mimeType};base64,${last.image.data}` : undefined;

    const out = channel<Chunk>();
    this.agent
      .run({ text, image, signal, onText: (t: string) => out.push({ type: 'text', text: t }), onTool: undefined })
      .then(() => { out.push({ type: 'done' }); out.close(); }, (err: unknown) => out.fail(err));
    yield* out;
  }
}
