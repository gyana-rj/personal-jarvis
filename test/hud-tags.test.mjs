import { describe, it, expect } from 'vitest';
import { createHudFilter } from '../bridge/hud-tags.mjs';

function run(chunks) {
  let text = '';
  const panels = [];
  const f = createHudFilter({ onText: (t) => (text += t), onPanel: (type, data) => panels.push({ type, data }) });
  chunks.forEach((c) => f.push(c));
  f.end();
  return { text, panels };
}

describe('createHudFilter', () => {
  it('passes plain text through', () => {
    expect(run(['Hello, ', 'sir.']).text).toBe('Hello, sir.');
  });
  it('extracts a panel and keeps it out of the spoken text', () => {
    const r = run(['Two meetings, sir.<hud type="calendar">{"events":[]}</hud>']);
    expect(r.text).toBe('Two meetings, sir.');
    expect(r.panels).toEqual([{ type: 'calendar', data: { events: [] } }]);
  });
  it('handles tags split across arbitrary chunk boundaries', () => {
    const s = 'Hi.<hud type="calendar">{"a":1}</hud> Bye.';
    const r = run(s.split(''));
    expect(r.text).toBe('Hi. Bye.');
    expect(r.panels).toEqual([{ type: 'calendar', data: { a: 1 } }]);
  });
  it('does not swallow a stray "<" that is not a tag', () => {
    expect(run(['3 < 5 and <h', 'ello>']).text).toBe('3 < 5 and <hello>');
  });
  it('drops malformed JSON silently', () => {
    const r = run(['ok<hud type="calendar">{bad</hud>']);
    expect(r.text).toBe('ok');
    expect(r.panels).toEqual([]);
  });
});
