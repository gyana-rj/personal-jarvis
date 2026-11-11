const OPEN = '<hud ';
const CLOSE = '</hud>';

/**
 * Splits a streamed model reply into spoken text and structured HUD payloads.
 * The model emits `<hud type="calendar">{...json...}</hud>`; those never reach the voice.
 * Tags may be split across chunks, so partial openers are held back until resolved.
 */
export function createHudFilter({ onText, onPanel }) {
  let buf = '';
  let inTag = false;
  let panelType = '';

  function flushText(end) {
    const out = buf.slice(0, end);
    buf = buf.slice(end);
    if (out) onText(out);
  }

  function push(chunk) {
    buf += chunk;
    for (;;) {
      if (!inTag) {
        const i = buf.indexOf(OPEN);
        if (i >= 0) {
          const gt = buf.indexOf('>', i);
          if (gt < 0) return flushText(i);
          panelType = (buf.slice(i, gt).match(/type="([^"]+)"/) ?? [])[1] ?? 'unknown';
          flushText(i);
          buf = buf.slice(gt + 1 - i);
          inTag = true;
          continue;
        }
        // Hold back a trailing fragment that could still become "<hud ".
        let hold = 0;
        for (let n = Math.min(OPEN.length - 1, buf.length); n > 0; n--) {
          if (OPEN.startsWith(buf.slice(-n))) { hold = n; break; }
        }
        return flushText(buf.length - hold);
      }
      const j = buf.indexOf(CLOSE);
      if (j < 0) return;
      const body = buf.slice(0, j);
      buf = buf.slice(j + CLOSE.length);
      inTag = false;
      try {
        onPanel(panelType, JSON.parse(body));
      } catch {
        // Malformed payload: drop it silently rather than speak JSON aloud.
      }
    }
  }

  function end() {
    if (!inTag && buf) onText(buf);
    buf = '';
    inTag = false;
  }

  return { push, end };
}
