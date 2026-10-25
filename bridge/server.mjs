import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadDotEnv } from './env.mjs';
import { resolveMcpServers } from './mcp-config.mjs';
import { createTts } from './tts.mjs';
import { parseDataUrl } from './llm/image.ts';
import { selectProvider } from './llm/select.ts';
import { createAssistant } from './llm/assistant.ts';
import { connectMcpServers } from './llm/mcp-client.ts';
import { RATE_LIMIT_MESSAGE } from './llm/types.ts';

const HOST = '127.0.0.1';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Reject cross-site and DNS-rebinding requests: only pages served from localhost may talk to us.
function isLocalRequest(req) {
  const hostOk = LOCAL_HOSTS.has((req.headers.host ?? '').replace(/:\d+$/, ''));
  const origin = req.headers.origin;
  if (!origin) return hostOk;
  try {
    return hostOk && LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

// What Jarvis says when a turn fails. Never includes provider error text (it can echo request details).
export function errorLine(err) {
  if (err instanceof Error && err.name === 'RateLimitError') return RATE_LIMIT_MESSAGE;
  if (err?.status === 401 || err?.status === 403 || (err?.status === 400 && /api key/i.test(err?.message ?? ''))) {
    return "I can't seem to authenticate with my brain, sir. Please check the API key and restart me.";
  }
  return 'My apologies, sir. I seem to have lost my train of thought.';
}

export function createBridge({ tts, agent, port = 0 }) {
  const server = http.createServer(async (req, res) => {
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (!isLocalRequest(req)) return json(403, { error: 'forbidden' });
    const url = new URL(req.url ?? '/', `http://${HOST}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(200, { ok: true, elevenlabs: tts.available, tools: agent.serverNames });
    }
    if (req.method === 'POST' && url.pathname === '/tts') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 20_000) return json(413, { error: 'too_large' });
      }
      let text;
      try { text = JSON.parse(raw).text; } catch { return json(400, { error: 'bad_json' }); }
      const out = await tts.synth(text);
      if (!out.ok) return json(out.status, { error: out.error, fallback: out.fallback });
      res.writeHead(200, { 'content-type': out.contentType, 'cache-control': 'no-store' });
      return res.end(out.audio);
    }
    json(404, { error: 'not_found' });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 12 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (!isLocalRequest(req) || req.url !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
    const history = [];
    let current;
    send({ type: 'hello', elevenlabs: tts.available, tools: agent.serverNames, provider: agent.provider });

    ws.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'cancel') return current?.abort();
      if (msg.type !== 'ask' || typeof msg.text !== 'string' || !msg.text.trim()) return;
      current?.abort();
      const ac = (current = new AbortController());
      try {
        await agent.run({
          text: msg.text,
          image: parseDataUrl(msg.image),
          history,
          signal: ac.signal,
          onText: (delta) => send({ type: 'text', delta }),
          onPanel: (panel, payload) => send({ type: 'panel', panel, data: payload }),
          onTool: (name) => send({ type: 'tool', name }),
        });
        send({ type: 'done' });
      } catch (err) {
        if (!ac.signal.aborted) {
          console.error('agent error:', err instanceof Error ? err.name : 'unknown', err?.status ?? '');
          send({ type: 'error', message: errorLine(err) });
        }
      }
    });
    ws.on('close', () => current?.abort());
  });

  return {
    server,
    listen: () => new Promise((resolve) => server.listen(port, HOST, () => resolve(server.address().port))),
    close: () => { wss.close(); server.closeAllConnections?.(); return new Promise((r) => server.close(r)); },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadDotEnv();
  const { servers, source } = resolveMcpServers();
  let provider;
  try {
    provider = selectProvider(process.env, { mcpServers: servers });
  } catch (err) {
    if (err instanceof Error && err.name === 'ConfigError') {
      console.error(`\nJARVIS cannot start: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  // The Claude Agent SDK launches MCP servers itself; every other provider uses the bridge's MCP client.
  const hub = provider.managesTools ? undefined : await connectMcpServers(servers);
  const serverNames = hub ? hub.connected : Object.keys(servers);
  const assistant = createAssistant({ provider, mcpTools: hub?.tools, serverNames });
  const agent = { run: assistant.run, serverNames, provider: provider.name };
  const tts = createTts({ apiKey: process.env.ELEVENLABS_API_KEY, voiceId: process.env.JARVIS_VOICE_ID });
  const bridge = createBridge({ tts, agent, port: Number(process.env.BRIDGE_PORT ?? 8787) });
  const bound = await bridge.listen();
  // Names only: the contents of the MCP config files are never logged.
  console.log(`bridge listening on ${HOST}:${bound}`);
  console.log(`llm: ${provider.name} (${provider.model})`);
  console.log(`mcp servers (${source}): ${serverNames.join(', ') || 'none'}${hub?.failed.length ? `; failed to connect: ${hub.failed.join(', ')}` : ''}`);
  console.log(`elevenlabs: ${tts.available ? 'available' : 'unavailable (browser voice fallback)'}`);
  const shutdown = () => { void hub?.close().finally(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
