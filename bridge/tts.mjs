const API = 'https://api.elevenlabs.io/v1/text-to-speech';

/**
 * ElevenLabs proxy. The key never leaves this process.
 * When keys are missing or upstream fails, callers get a `fallback: 'browser'` signal
 * so the frontend can use speechSynthesis instead.
 */
export function createTts({ apiKey, voiceId, fetchImpl = fetch } = {}) {
  const available = Boolean(apiKey && voiceId);

  async function synth(text) {
    if (!available) return { ok: false, status: 503, error: 'tts_unavailable', fallback: 'browser' };
    if (typeof text !== 'string' || !text.trim()) return { ok: false, status: 400, error: 'empty_text' };
    try {
      const res = await fetchImpl(`${API}/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text: text.slice(0, 2500), model_id: 'eleven_turbo_v2_5' }),
      });
      if (!res.ok) return { ok: false, status: 502, error: `upstream_${res.status}`, fallback: 'browser' };
      return { ok: true, status: 200, contentType: 'audio/mpeg', audio: Buffer.from(await res.arrayBuffer()) };
    } catch {
      return { ok: false, status: 502, error: 'upstream_unreachable', fallback: 'browser' };
    }
  }

  return { available, synth };
}
