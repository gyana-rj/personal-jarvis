import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectMcpServers, toolName, flattenResult } from '../bridge/llm/mcp-client.ts';
import { toFunctionDeclaration } from '../bridge/llm/schema.ts';
import { resolveMcpServers } from '../bridge/mcp-config.mjs';

const fixture = fileURLToPath(new URL('./fixtures/echo-mcp.mjs', import.meta.url));
let hub;
afterAll(() => hub?.close());

describe('connectMcpServers (real stdio server)', () => {
  it('connects, lists tools, converts schemas for Gemini, and executes calls', async () => {
    hub = await connectMcpServers({ 'google calendar': { command: process.execPath, args: [fixture] }, dead: { command: 'definitely-not-a-command-xyz' } });
    expect(hub.connected).toEqual(['google calendar']);
    expect(hub.failed).toEqual(['dead']);

    const tool = hub.tools.find((t) => t.name === 'google_calendar__list-events');
    expect(tool).toBeTruthy();
    const decl = toFunctionDeclaration(tool);
    expect(decl.parameters).toEqual({ type: 'OBJECT', properties: { day: { type: 'STRING' }, limit: { type: 'INTEGER' } }, required: ['day'] });

    expect(await tool.execute({ day: 'today' })).toBe('events for today: standup at 09:30');
    await expect(hub.tools.find((t) => t.name.endsWith('__boom')).execute({})).rejects.toThrow('it broke');
  }, 30_000);
});

describe('helpers', () => {
  it('namespaces tool names into Gemini-legal identifiers', () => {
    expect(toolName('google-calendar', 'list events')).toBe('google-calendar__list_events');
    expect(toolName('1x', 'a')).toMatch(/^[A-Za-z_]/);
    expect(toolName('s', 'x'.repeat(100))).toHaveLength(64);
  });
  it('flattens MCP results to text', () => {
    expect(flattenResult({ content: [{ type: 'text', text: 'a' }, { type: 'image' }] })).toBe('a\n[image content omitted]');
    expect(flattenResult({ content: [] })).toBe('(no output)');
  });
});

describe('resolveMcpServers', () => {
  const tmp = (obj) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jv-')), 'c.json'); if (obj) fs.writeFileSync(f, JSON.stringify(obj)); return f; };
  it('prefers jarvis.mcp.json, falls back to ~/.claude.json, else none', () => {
    const project = tmp({ mcpServers: { a: { command: 'x' } } });
    const home = tmp({ mcpServers: { b: { command: 'y' } } });
    expect(resolveMcpServers({ projectFile: project, homeFile: home })).toMatchObject({ source: 'jarvis.mcp.json', servers: { a: { command: 'x' } } });
    expect(resolveMcpServers({ projectFile: tmp(), homeFile: home })).toMatchObject({ source: '~/.claude.json', servers: { b: { command: 'y' } } });
    expect(resolveMcpServers({ projectFile: tmp(), homeFile: tmp() })).toEqual({ servers: {}, source: 'none' });
  });
});
