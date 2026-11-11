import { describe, it, expect } from 'vitest';
import { runToolLoop, MAX_TOOL_ROUNDS } from '../bridge/llm/loop.ts';
import { createAssistant } from '../bridge/llm/assistant.ts';
import { MockProvider } from '../bridge/llm/providers/mock.ts';

const call = (id, name, args = {}) => ({ type: 'tool_call', call: { id, name, args } });
const text = (t) => ({ type: 'text', text: t });
const done = { type: 'done' };

const clock = { name: 'get_time', description: 'time', parameters: { type: 'object' }, execute: async () => '09:41' };

describe('runToolLoop', () => {
  it('model -> tool call -> result -> final text', async () => {
    const provider = new MockProvider([[call('1', 'get_time'), done], [text('It is nine forty-one, sir.'), done]]);
    const messages = [{ role: 'user', text: 'time?' }];
    const seen = [];
    const final = await runToolLoop(provider, messages, [clock], undefined, { onTool: (n) => seen.push(n) });
    expect(final).toBe('It is nine forty-one, sir.');
    expect(seen).toEqual(['get_time']);
    // The tool result went back to the model on the second request.
    expect(provider.calls[1].messages.at(-1)).toEqual({ role: 'tool', results: [{ id: '1', name: 'get_time', output: '09:41' }] });
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('feeds tool failures back as error results instead of throwing', async () => {
    const boom = { ...clock, name: 'boom', execute: async () => { throw new Error('nope'); } };
    const provider = new MockProvider([[call('1', 'boom'), call('2', 'missing'), done], [text('Regrettably not.'), done]]);
    const messages = [{ role: 'user', text: 'x' }];
    await runToolLoop(provider, messages, [boom], undefined);
    const results = provider.calls[1].messages.at(-1).results;
    expect(results[0]).toMatchObject({ isError: true, output: 'nope' });
    expect(results[1]).toMatchObject({ isError: true, output: 'Unknown tool "missing".' });
  });

  it('runs parallel calls from one round together', async () => {
    const provider = new MockProvider([[call('a', 'get_time'), call('b', 'get_time'), done], [text('Two clocks, sir.'), done]]);
    const messages = [{ role: 'user', text: 'x' }];
    await runToolLoop(provider, messages, [clock], undefined);
    expect(provider.calls[1].messages.at(-1).results.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it(`stops after ${MAX_TOOL_ROUNDS} rounds and forces a tool-less final answer`, async () => {
    const loopForever = () => [call('x', 'get_time'), done];
    const scripts = Array.from({ length: MAX_TOOL_ROUNDS }, () => loopForever);
    scripts.push([text('Enough, sir.'), done]);
    const provider = new MockProvider(scripts);
    const final = await runToolLoop(provider, [{ role: 'user', text: 'x' }], [clock], undefined);
    expect(final).toBe('Enough, sir.');
    expect(provider.calls).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(provider.calls.slice(0, MAX_TOOL_ROUNDS).every((c) => c.tools.length === 1)).toBe(true);
    expect(provider.calls.at(-1).tools).toHaveLength(0);
  });
});

describe('createAssistant', () => {
  it('filters HUD blocks into panels, keeps history, and bounds it', async () => {
    const reply = [text('Two meetings, sir.<hud type="calen'), text('dar">{"events":[]}</hud>'), done];
    const provider = new MockProvider([reply, reply]);
    const a = createAssistant({ provider, serverNames: [] });
    const history = [];
    let spoken = '';
    const panels = [];
    for (let i = 0; i < 2; i++) await a.run({ text: `q${i}`, history, onText: (t) => (spoken += t), onPanel: (t, d) => panels.push([t, d]) });
    expect(spoken).toBe('Two meetings, sir.Two meetings, sir.');
    expect(panels).toEqual([['calendar', { events: [] }], ['calendar', { events: [] }]]);
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(provider.calls[1].messages).toHaveLength(3); // prior turn is sent as context
  });

  it('drops a failed turn from history', async () => {
    const provider = new MockProvider([() => { throw new Error('boom'); }]);
    const a = createAssistant({ provider, serverNames: [] });
    const history = [];
    await expect(a.run({ text: 'hi', history, onText() {}, onPanel() {} })).rejects.toThrow('boom');
    expect(history).toEqual([]);
  });

  it('includes get_current_time and provider tools, but no tools for self-managed providers', () => {
    const p = new MockProvider();
    expect(createAssistant({ provider: p, serverNames: [] }).tools.map((t) => t.name)).toContain('get_current_time');
    const managed = Object.assign(new MockProvider(), { managesTools: true });
    expect(createAssistant({ provider: managed, serverNames: [] }).tools).toEqual([]);
  });
});
