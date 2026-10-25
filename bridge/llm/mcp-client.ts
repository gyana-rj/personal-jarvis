import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Tool } from './types';

const CONNECT_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 30_000;

/** Gemini function names: letters, digits, underscore, dot, dash; max 64; must start with a letter/underscore. */
export function toolName(server: string, tool: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, '_');
  const name = `${clean(server)}__${clean(tool)}`.replace(/^[^A-Za-z_]/, '_');
  return name.slice(0, 64);
}

export interface McpHub {
  /** Servers that connected (names only). */
  connected: string[];
  /** Servers that failed to connect (names only; reasons are not logged because they can echo secrets). */
  failed: string[];
  tools: Tool[];
  close(): Promise<void>;
}

function makeTransport(cfg: any) {
  const type = cfg.type ?? (cfg.command ? 'stdio' : undefined);
  if (type === 'stdio') {
    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args ?? [],
      env: { ...getDefaultEnvironment(), ...(cfg.env ?? {}) },
      stderr: 'ignore',
    });
  }
  const init = cfg.headers ? { requestInit: { headers: cfg.headers } } : {};
  if (type === 'sse') return new SSEClientTransport(new URL(cfg.url), init);
  return new StreamableHTTPClientTransport(new URL(cfg.url), init);
}

export function flattenResult(result: any): string {
  const parts = (result?.content ?? []).map((c: any) =>
    c.type === 'text' ? c.text : c.type === 'resource' && c.resource?.text ? c.resource.text : `[${c.type} content omitted]`,
  );
  const text = parts.join('\n').trim();
  return text || (result?.structuredContent ? JSON.stringify(result.structuredContent) : '(no output)');
}

/** Connects to every configured MCP server and exposes their tools. One bad server never blocks the rest. */
export async function connectMcpServers(servers: Record<string, unknown>): Promise<McpHub> {
  const clients: Client[] = [];
  const tools: Tool[] = [];
  const connected: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    Object.entries(servers).map(async ([name, cfg]) => {
      const client = new Client({ name: 'jarvis', version: '0.1.0' });
      try {
        await client.connect(makeTransport(cfg), { timeout: CONNECT_TIMEOUT_MS });
        const listed: any[] = [];
        let cursor: string | undefined;
        do {
          const page = await client.listTools({ cursor }, { timeout: CONNECT_TIMEOUT_MS });
          listed.push(...page.tools);
          cursor = page.nextCursor;
        } while (cursor);
        for (const t of listed) {
          tools.push({
            name: toolName(name, t.name),
            description: t.description ?? t.title ?? t.name,
            parameters: t.inputSchema ?? { type: 'object' },
            execute: async (args, signal) => {
              const res: any = await client.callTool({ name: t.name, arguments: args }, undefined, { signal, timeout: CALL_TIMEOUT_MS });
              const text = flattenResult(res);
              if (res.isError) throw new Error(text);
              return text;
            },
          });
        }
        clients.push(client);
        connected.push(name);
      } catch {
        failed.push(name);
        await client.close().catch(() => {});
      }
    }),
  );

  return {
    connected,
    failed,
    tools,
    close: async () => { await Promise.allSettled(clients.map((c) => c.close())); },
  };
}
