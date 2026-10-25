import { createHudFilter } from '../hud-tags.mjs';
import { runToolLoop } from './loop';
import type { ImageData, LLMProvider, Message, Tool } from './types';

const MAX_HISTORY = 24;

export const currentTimeTool: Tool = {
  name: 'get_current_time',
  description: "Returns the user's current local date, time and timezone. Use for any question about the time, date or day.",
  parameters: { type: 'object' },
  execute: async () => {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      local: now.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  },
};

export interface AssistantDeps {
  provider: LLMProvider;
  mcpTools?: Tool[];
  /** Names shown in the HUD tool list. */
  serverNames: string[];
}

export interface RunArgs {
  text: string;
  image?: ImageData;
  /** Conversation so far; mutated in place so the caller keeps multi-turn context. */
  history: Message[];
  signal?: AbortSignal;
  onText(text: string): void;
  onPanel(type: string, data: unknown): void;
  onTool?(name: string): void;
}

/** The bridge-facing agent: provider + tools + HUD-tag filtering. */
export function createAssistant({ provider, mcpTools = [], serverNames }: AssistantDeps) {
  const tools: Tool[] = provider.managesTools ? [] : [...(provider.builtinTools?.() ?? []), currentTimeTool, ...mcpTools];

  async function run({ text, image, history, signal, onText, onPanel, onTool }: RunArgs): Promise<void> {
    const start = history.length;
    history.push({ role: 'user', text, image });
    const filter = createHudFilter({ onText, onPanel });
    try {
      await runToolLoop(provider, history, tools, signal, { onText: (t) => filter.push(t), onTool });
    } catch (err) {
      history.length = start; // a failed or cancelled turn leaves no half-finished exchange behind
      throw err;
    } finally {
      filter.end();
    }
    // Keep memory bounded, and never start the window on a dangling tool result.
    while (history.length > MAX_HISTORY || (history[0] && history[0].role !== 'user')) history.shift();
    // Screens are big; only the latest frame is worth keeping.
    const latest = history.findLast((m) => m.role === 'user');
    for (const m of history) if (m.role === 'user' && m !== latest) delete m.image;
  }

  return { run, serverNames, tools };
}
