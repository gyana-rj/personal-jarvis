import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});

const port = await freePort();
const child = spawn(process.execPath, [fileURLToPath(new URL('../bridge/server.mjs', import.meta.url))], {
  env: { ...process.env, BRIDGE_PORT: String(port), ELEVENLABS_API_KEY: '', JARVIS_VOICE_ID: '', HOME: process.env.SMOKE_HOME ?? process.env.HOME },
  stdio: ['ignore', 'pipe', 'inherit'],
});

let failed = false;
try {
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!ready) throw new Error('bridge did not come up');
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  if (health.ok !== true || typeof health.elevenlabs !== 'boolean') throw new Error(`bad /health: ${JSON.stringify(health)}`);
  const tts = await fetch(`http://127.0.0.1:${port}/tts`, { method: 'POST', body: JSON.stringify({ text: 'hello' }) });
  if (tts.status !== 503) throw new Error(`expected /tts 503 without keys, got ${tts.status}`);
  console.log(`smoke ok: /health ${JSON.stringify(health)}, /tts fallback 503`);
} catch (err) {
  failed = true;
  console.error('smoke failed:', err.message);
} finally {
  child.kill();
}
process.exit(failed ? 1 : 0);
