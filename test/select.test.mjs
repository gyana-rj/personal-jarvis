import { describe, it, expect } from 'vitest';
import { selectProvider } from '../bridge/llm/select.ts';
import { DEFAULT_GEMINI_MODEL } from '../bridge/llm/providers/gemini.ts';

describe('selectProvider', () => {
  it('defaults to gemini with the current Flash model', () => {
    const p = selectProvider({ GEMINI_API_KEY: 'k' });
    expect(p.name).toBe('gemini');
    expect(p.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash');
  });
  it('honours LLM_MODEL', () => {
    expect(selectProvider({ GEMINI_API_KEY: 'k', LLM_MODEL: 'gemini-2.5-flash' }).model).toBe('gemini-2.5-flash');
  });
  it('fails clearly when the Gemini key is missing, without echoing any secrets', () => {
    expect(() => selectProvider({})).toThrowError(/GEMINI_API_KEY is not set.*aistudio\.google\.com/s);
    expect(() => selectProvider({ LLM_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'sk-secret' })).toThrowError(/GEMINI_API_KEY/);
    try { selectProvider({ ANTHROPIC_API_KEY: 'sk-secret' }); } catch (e) { expect(e.message).not.toContain('sk-secret'); expect(e.name).toBe('ConfigError'); }
  });
  it('selects anthropic only with its key', () => {
    expect(() => selectProvider({ LLM_PROVIDER: 'anthropic' })).toThrowError(/ANTHROPIC_API_KEY is not set/);
    const p = selectProvider({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' });
    expect(p.name).toBe('anthropic');
    expect(p.managesTools).toBe(true);
  });
  it('is case-insensitive and allows the keyless mock provider', () => {
    expect(selectProvider({ LLM_PROVIDER: ' Mock ' }).name).toBe('mock');
  });
  it('rejects unknown providers', () => {
    expect(() => selectProvider({ LLM_PROVIDER: 'gpt' })).toThrowError(/Unknown LLM_PROVIDER "gpt"/);
  });
});
