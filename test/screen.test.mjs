import { describe, it, expect } from 'vitest';
import { SCREEN_RE } from '../src/screen.ts';

describe('SCREEN_RE', () => {
  it.each(["What's on my screen?", 'what is on the screen', 'look at my screen', 'describe my screen please'])('matches %s', (t) => {
    expect(SCREEN_RE.test(t)).toBe(true);
  });
  it.each(['Search for AI news', 'what time is it', 'turn the screen brightness up'])('ignores %s', (t) => {
    expect(SCREEN_RE.test(t)).toBe(false);
  });
});
