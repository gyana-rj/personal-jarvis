import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const defaultClaudeJsonPath = () => path.join(os.homedir(), '.claude.json');

function isServerConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  const type = cfg.type ?? (cfg.command ? 'stdio' : undefined);
  if (type === 'stdio') return typeof cfg.command === 'string' && cfg.command.length > 0;
  if (type === 'http' || type === 'sse') return typeof cfg.url === 'string' && cfg.url.length > 0;
  return false;
}

/**
 * Read the top-level `mcpServers` map from ~/.claude.json.
 * Returns only the server map; callers must not log it (it can hold tokens in env/headers).
 * A missing or malformed file yields an empty map rather than a crash.
 */
export function loadMcpServers(file = defaultClaudeJsonPath()) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
  const raw = parsed && typeof parsed === 'object' ? parsed.mcpServers : undefined;
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([, cfg]) => isServerConfig(cfg)));
}
