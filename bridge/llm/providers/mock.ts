import type { Chunk, LLMProvider, Message, Tool } from '../types';

export type MockScript = Chunk[] | ((messages: Message[], tools: Tool[]) => Chunk[]);

/**
 * Scripted provider for tests and keyless demos (LLM_PROVIDER=mock).
 * Each stream() call consumes the next script entry; without scripts it answers in character.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'mock';
  readonly calls: { messages: Message[]; tools: Tool[] }[] = [];
  private i = 0;

  constructor(private scripts: MockScript[] = []) {}

  async *stream(messages: Message[], tools: Tool[], signal?: AbortSignal): AsyncIterable<Chunk> {
    this.calls.push({ messages: structuredClone(messages), tools });
    const script = this.scripts[this.i++];
    let chunks: Chunk[];
    if (script) {
      chunks = typeof script === 'function' ? script(messages, tools) : script;
    } else {
      const last = [...messages].reverse().find((m) => m.role === 'user');
      const said = last && last.role === 'user' ? last.text : '';
      chunks = [{ type: 'text', text: `Mock provider at your service, sir. You said: ${said}.` }, { type: 'done' }];
    }
    for (const c of chunks) {
      if (signal?.aborted) return;
      yield c;
    }
  }
}
