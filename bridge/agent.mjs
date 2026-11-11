import { SYSTEM_PROMPT } from './prompt.mjs';
import { spawnClaudeCodeProcess } from './spawn.mjs';

const MAX_IMAGE_CHARS = 10_000_000;

export function parseImage(dataUrl) {
  const m = typeof dataUrl === 'string' && dataUrl.length < MAX_IMAGE_CHARS
    ? dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/)
    : null;
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : null;
}

export function buildPrompt(text, image) {
  const img = image ? parseImage(image) : null;
  if (!img) return text;
  const message = { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [img, { type: 'text', text }] } };
  return (async function* () { yield message; })();
}

export function createAgent({ mcpServers, model }) {
  const serverNames = Object.keys(mcpServers);
  const options = {
    systemPrompt: SYSTEM_PROMPT,
    mcpServers,
    model,
    // Voice assistant: web + connected MCP tools only. No shell or file access.
    tools: ['WebSearch', 'WebFetch'],
    allowedTools: ['WebSearch', 'WebFetch', ...serverNames.map((n) => `mcp__${n}`)],
    permissionMode: 'dontAsk',
    settingSources: [],
    includePartialMessages: true,
    spawnClaudeCodeProcess,
  };

  /**
   * Runs one turn on the Claude Agent SDK. `onText` receives raw deltas (HUD tags are filtered by
   * the caller). The SDK is loaded lazily so Gemini-only installs never need it.
   */
  async function run({ text, image, signal, onText, onTool }) {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const abortController = new AbortController();
    signal?.addEventListener('abort', () => abortController.abort(), { once: true });
    const q = query({
      prompt: buildPrompt(text, image),
      options: { ...options, abortController },
    });
    for await (const msg of q) {
      if (msg.type === 'stream_event') {
        const e = msg.event;
        if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') onText(e.delta.text);
      } else if (msg.type === 'assistant') {
        for (const b of msg.message.content ?? []) if (b.type === 'tool_use') onTool?.(b.name);
      } else if (msg.type === 'result' && msg.is_error) {
        throw new Error('agent_error');
      }
    }
  }

  return { run, serverNames };
}
