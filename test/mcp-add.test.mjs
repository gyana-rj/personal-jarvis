import { describe, it, expect } from 'vitest';
import { buildEntries, mergeServers } from '../scripts/mcp-add.mjs';

describe('mcp:add', () => {
  it('returns null without credentials in env', () => {
    expect(buildEntries({})).toBeNull();
  });
  it('takes credentials from env and never embeds secrets', () => {
    const e = buildEntries({ GOOGLE_OAUTH_CREDENTIALS: '/keys.json' });
    expect(Object.keys(e)).toEqual(['google-calendar', 'gmail']);
    expect(e['google-calendar'].env.GOOGLE_OAUTH_CREDENTIALS).toBe('/keys.json');
    expect(JSON.stringify(e)).not.toMatch(/client_secret/);
  });
  it('keeps existing entries unless forced and leaves unrelated servers alone', () => {
    const entries = { gmail: { command: 'new' }, 'google-calendar': { command: 'new' } };
    const r = mergeServers({ gmail: { command: 'old' }, other: { command: 'x' } }, entries);
    expect(r.skipped).toEqual(['gmail']);
    expect(r.servers.gmail.command).toBe('old');
    expect(r.servers.other.command).toBe('x');
    expect(mergeServers({ gmail: { command: 'old' } }, entries, true).servers.gmail.command).toBe('new');
  });
});
