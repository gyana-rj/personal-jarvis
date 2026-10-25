import type { Chunk, LLMProvider, Message, Tool, ToolCall, ToolResult } from './types';

export const MAX_TOOL_ROUNDS = 8;
const MAX_RESULT_CHARS = 8000;

export interface LoopHooks {
  onText?(text: string): void;
  onTool?(name: string): void;
}

async function runTool(tool: Tool | undefined, call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
  if (!tool) return { id: call.id, name: call.name, output: `Unknown tool "${call.name}".`, isError: true };
  try {
    const out = await tool.execute(call.args, signal);
    return { id: call.id, name: call.name, output: out.length > MAX_RESULT_CHARS ? `${out.slice(0, MAX_RESULT_CHARS)}\n[truncated]` : out };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { id: call.id, name: call.name, output: err instanceof Error ? err.message.slice(0, 500) : 'Tool failed.', isError: true };
  }
}

/**
 * model -> tool call -> execute -> send result back -> repeat, at most MAX_TOOL_ROUNDS rounds.
 * Appends every turn to `messages` (so the caller keeps multi-turn history) and returns the final text.
 * If the model is still asking for tools after the last round, one more tool-less call forces an answer.
 */
export async function runToolLoop(
  provider: LLMProvider,
  messages: Message[],
  tools: Tool[],
  signal: AbortSignal | undefined,
  hooks: LoopHooks = {},
): Promise<string> {
  const byName = new Map(tools.map((t) => [t.name, t]));
  let finalText = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const exhausted = round === MAX_TOOL_ROUNDS;
    let text = '';
    const calls: ToolCall[] = [];
    let raw: unknown;

    for await (const chunk of provider.stream(messages, exhausted ? [] : tools, signal) as AsyncIterable<Chunk>) {
      if (chunk.type === 'text') { text += chunk.text; hooks.onText?.(chunk.text); }
      else if (chunk.type === 'tool_call') calls.push(chunk.call);
      else raw = chunk.raw;
    }

    messages.push({ role: 'assistant', text, toolCalls: calls.length ? calls : undefined, raw });
    finalText = text;
    if (!calls.length || exhausted) return finalText;

    calls.forEach((c) => hooks.onTool?.(c.name));
    const results = await Promise.all(calls.map((c) => runTool(byName.get(c.name), c, signal)));
    messages.push({ role: 'tool', results });
  }
  return finalText;
}
