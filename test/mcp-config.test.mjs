import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadMcpServers } from '../bridge/mcp-config.mjs';

const tmp = (content) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-')), '.claude.json');
  if (content !== undefined) fs.writeFileSync(f, content);
  return f;
};

describe('loadMcpServers', () => {
  it('returns the mcpServers map and ignores the rest of the file', () => {
    const f = tmp(JSON.stringify({ oauthAccount: { email: 'x' }, mcpServers: { cal: { command: 'npx', args: ['a'] }, web: { type: 'http', url: 'https://x' } } }));
    expect(Object.keys(loadMcpServers(f))).toEqual(['cal', 'web']);
  });
  it('drops malformed entries', () => {
    const f = tmp(JSON.stringify({ mcpServers: { ok: { command: 'x' }, bad: { foo: 1 }, nul: null } }));
    expect(Object.keys(loadMcpServers(f))).toEqual(['ok']);
  });
  it('returns {} for missing file, bad JSON, or no mcpServers', () => {
    expect(loadMcpServers(tmp())).toEqual({});
    expect(loadMcpServers(tmp('{nope'))).toEqual({});
    expect(loadMcpServers(tmp('{}'))).toEqual({});
  });
});
