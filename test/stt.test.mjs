import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('window', { SpeechRecognition: class {} });
const { afterWake } = await import('../src/stt.ts');

describe('afterWake', () => {
  it('returns null without the wake phrase', () => {
    expect(afterWake('what time is it')).toBeNull();
  });
  it('returns an empty command for the bare wake phrase', () => {
    expect(afterWake('Hey Jarvis')).toBe('');
  });
  it('extracts the command after the wake phrase', () => {
    expect(afterWake('hey jarvis, what is on my calendar')).toBe('what is on my calendar');
    expect(afterWake('um Hey, Jarvis search for AI news')).toBe('search for AI news');
  });
});
