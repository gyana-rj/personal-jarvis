/** Provider-neutral conversation model shared by the bridge and every LLM provider. */

export interface ImageData {
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  /** Text handed back to the model. */
  output: string;
  isError?: boolean;
}

export type Message =
  | { role: 'user'; text: string; image?: ImageData }
  | {
      role: 'assistant';
      text: string;
      toolCalls?: ToolCall[];
      /** Opaque provider data (e.g. Gemini thought signatures) replayed verbatim on the next request. */
      raw?: unknown;
    }
  | { role: 'tool'; results: ToolResult[] };

export type Chunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; raw?: unknown };

/** A callable tool: JSON-schema parameters, plus how to run it. */
export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /**
   * Providers that run their own tool loop (the Claude Agent SDK) set this; the bridge then
   * passes no tools and does not loop.
   */
  readonly managesTools?: boolean;
  /** Tools the provider itself contributes (e.g. Gemini's grounded web_search). */
  builtinTools?(): Tool[];
  stream(messages: Message[], tools: Tool[], signal?: AbortSignal): AsyncIterable<Chunk>;
}

/** Startup misconfiguration (missing key, unknown provider). Message is safe to print. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** The provider kept answering 429 after all retries. */
export class RateLimitError extends Error {
  override name = 'RateLimitError';
}

export const RATE_LIMIT_MESSAGE = "I'm being rate-limited, sir. Give me a moment.";
