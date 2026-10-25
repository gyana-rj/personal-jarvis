import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadDotEnv } from './env.mjs';
import { loadMcpServers } from './mcp-config.mjs';
import { createTts } from './tts.mjs';
import { createAgent } from './agent.mjs';

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
    let sessionId;
    let current;
    send({ type: 'hello', elevenlabs: tts.available, tools: agent.serverNames });

    ws.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'cancel') return current?.abort();
      if (msg.type !== 'ask' || typeof msg.text !== 'string' || !msg.text.trim()) return;
      current?.abort();
      const ac = (current = new AbortController());
      try {
        sessionId = await agent.run({
          text: msg.text,
          image: msg.image,
          sessionId,
          signal: ac.signal,
          onText: (delta) => send({ type: 'text', delta }),
          onPanel: (panel, payload) => send({ type: 'panel', panel, data: payload }),
          onTool: (name) => send({ type: 'tool', name }),
        });
        send({ type: 'done' });
      } catch (err) {
        if (!ac.signal.aborted) {
          console.error('agent error:', err instanceof Error ? err.message : 'unknown');
          send({ type: 'error', message: 'My apologies, sir. I seem to have lost my train of thought.' });
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
  const mcpServers = loadMcpServers();
  const tts = createTts({ apiKey: process.env.ELEVENLABS_API_KEY, voiceId: process.env.JARVIS_VOICE_ID });
  const agent = createAgent({ mcpServers, model: process.env.JARVIS_MODEL });
  const bridge = createBridge({ tts, agent, port: Number(process.env.BRIDGE_PORT ?? 8787) });
  const bound = await bridge.listen();
  // Names only: the contents of ~/.claude.json are never logged.
  console.log(`bridge listening on ${HOST}:${bound}`);
  console.log(`mcp servers: ${agent.serverNames.join(', ') || 'none'}`);
  console.log(`elevenlabs: ${tts.available ? 'available' : 'unavailable (browser voice fallback)'}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('ANTHROPIC_API_KEY is not set; the agent will not be able to answer.');
}
