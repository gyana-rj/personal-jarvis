// Documents - and, with --write, performs - adding Google Calendar and Gmail MCP servers
// to ~/.claude.json. Credentials are read from the environment; nothing is hardcoded and
// the contents of ~/.claude.json are never printed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HELP = `
JARVIS - connect Google Calendar and Gmail

1. In Google Cloud Console create a project, enable the Google Calendar API and Gmail API,
   and create an OAuth client ID of type "Desktop app". Download its JSON file.
   Add your own Google account as a test user on the OAuth consent screen.
2. Point this script at that file (a path, not the secret itself):
     export GOOGLE_OAUTH_CREDENTIALS=/path/to/gcp-oauth.keys.json      (macOS/Linux)
     $env:GOOGLE_OAUTH_CREDENTIALS="C:\\path\\to\\gcp-oauth.keys.json"   (PowerShell)
3. Preview what will change, then write it:
     npm run mcp:add               # dry run, changes nothing
     npm run mcp:add -- --write    # merges into ~/.claude.json (backup kept alongside)
     npm run mcp:add -- --write --force   # also replace existing "google-calendar"/"gmail" entries
4. Complete the OAuth consent in your browser, once, on your own machine:
     npx -y @gongrzhe/server-gmail-autoauth-mcp auth
   Calendar authenticates the first time it is used (ask Jarvis for your calendar and follow
   the browser prompt). OAuth cannot be completed in a cloud sandbox.
5. Restart the bridge so it re-reads ~/.claude.json.

Servers used: @cocal/google-calendar-mcp and @gongrzhe/server-gmail-autoauth-mcp.
`;

const npx = (pkg, ...rest) =>
  process.platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'npx', '-y', pkg, ...rest] } // npx is a .cmd shim on Windows
    : { command: 'npx', args: ['-y', pkg, ...rest] };

export function buildEntries(env = process.env) {
  const creds = env.GOOGLE_OAUTH_CREDENTIALS;
  if (!creds) return null;
  return {
    'google-calendar': { type: 'stdio', ...npx('@cocal/google-calendar-mcp'), env: { GOOGLE_OAUTH_CREDENTIALS: creds } },
    gmail: { type: 'stdio', ...npx('@gongrzhe/server-gmail-autoauth-mcp'), env: { GMAIL_OAUTH_PATH: creds } },
  };
}

/** Returns { servers, added, skipped } without mutating the input. */
export function mergeServers(existing, entries, force = false) {
  const servers = { ...(existing ?? {}) };
  const added = [];
  const skipped = [];
  for (const [name, cfg] of Object.entries(entries)) {
    if (servers[name] && !force) { skipped.push(name); continue; }
    servers[name] = cfg;
    added.push(name);
  }
  return { servers, added, skipped };
}

function main() {
  const args = new Set(process.argv.slice(2));
  console.log(HELP);
  const entries = buildEntries();
  if (!entries) {
    console.error('GOOGLE_OAUTH_CREDENTIALS is not set, so there is nothing to add yet. Follow steps 1-2 above.');
    process.exit(args.has('--write') ? 1 : 0);
  }
  const file = path.join(os.homedir(), '.claude.json');
  let config = {};
  if (fs.existsSync(file)) {
    try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { console.error(`${file} is not valid JSON; refusing to touch it.`); process.exit(1); }
  }
  const { servers, added, skipped } = mergeServers(config.mcpServers, entries, args.has('--force'));
  console.log(`Would add: ${added.join(', ') || 'nothing'}${skipped.length ? `   Already present (kept): ${skipped.join(', ')}` : ''}`);
  if (!args.has('--write')) return console.log('Dry run only. Re-run with --write to apply.');
  if (!added.length) return;
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.jarvis-backup`);
  fs.writeFileSync(file, JSON.stringify({ ...config, mcpServers: servers }, null, 2) + '\n', { mode: 0o600 });
  console.log(`Updated ${file} (backup: ${file}.jarvis-backup). Now run step 4, then restart the bridge.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
