// Live smoke test against the real Gemini API. Skipped unless GEMINI_API_KEY is set.
import { describe, it, expect } from 'vitest';
import { selectProvider } from '../bridge/llm/select.ts';
import { createAssistant } from '../bridge/llm/assistant.ts';

const key = process.env.GEMINI_API_KEY;

describe.skipIf(!key)('live Gemini smoke', () => {
  const run = async (question) => {
    const provider = selectProvider({ ...process.env, LLM_PROVIDER: 'gemini' });
    const assistant = createAssistant({ provider, serverNames: [] });
    let text = '';
    const tools = [];
    await assistant.run({ text: question, history: [], onText: (t) => (text += t), onPanel() {}, onTool: (n) => tools.push(n) });
    return { text, tools };
  };

  it('answers "What time is it?" using the clock tool', async () => {
    const { text, tools } = await run('What time is it?');
    expect(tools).toContain('get_current_time');
    expect(text).toMatch(/\d/);
  }, 60_000);

  it('uses web_search for a current-events prompt', async () => {
    const { text, tools } = await run('Search the web for the latest AI news and give me one headline.');
    expect(tools).toContain('web_search');
    expect(text.length).toBeGreaterThan(20);
  }, 90_000);
});
