# Build Your Own Jarvis - Full Setup Guide

A personal voice assistant that runs in your browser: a dry British butler with a glowing HUD, wake word, calendar, web search and screen vision.

- **Brain:** Google Gemini by default (works with a **free** `GEMINI_API_KEY`), or Claude via the Claude Agent SDK as an optional provider. Tools come from any MCP servers you configure
- **Voice out:** your browser's built-in voices (free), or ElevenLabs if you add a key
- **Voice in:** Web Speech API (use **Chrome or Edge**; Firefox has no speech recognition)
- **Bridge:** a small Node server on `127.0.0.1` that keeps your keys off the web page

```
browser (Vite, :5173) --WebSocket/HTTP--> bridge (127.0.0.1:8787) --> LLM provider (Gemini | Claude)
                                                         |--> MCP servers (bridge-side MCP client)
                                                         `--> ElevenLabs (optional; keys stay server-side)
```

## 1. Install

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env      # then add GEMINI_API_KEY (see "Free setup with Gemini")
npm run dev               # starts the bridge and the web app
```

Open <http://127.0.0.1:5173> in Chrome or Edge and allow the microphone.

`.env`:

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `gemini` (default) or `anthropic` |
| `LLM_MODEL` | Optional model override. Default for Gemini: `gemini-3.8-flash` |
| `GEMINI_API_KEY` | Required for `gemini`. Free key from <https://aistudio.google.com/apikey> |
| `GEMINI_SEARCH_MODEL` | Optional. Model for the grounded `web_search` call. Default `gemini-2.5-flash` |
| `ANTHROPIC_API_KEY` | Required only for `anthropic` |
| `ELEVENLABS_API_KEY` | Optional. Without it Jarvis uses a browser voice |
| `JARVIS_VOICE_ID` | Optional. Which ElevenLabs voice to use |
| `BRIDGE_PORT` | Optional. Default `8787` |

The bridge reads `.env` once at boot, so **restart it after editing**.

## 2. Try these first

| Say | What happens |
| --- | --- |
| "Hey Jarvis" (then your request) | Wake word. The ring switches to *listening*, then your words go to the model |
| Hold **Space**, speak, release | Push-to-talk, no wake word needed |
| "Good morning, Jarvis" | Morning briefing: weather, today's calendar and any tasks. Calendar events also open as a HUD panel |
| "Search for AI news" | Google-grounded web search (`web_search`), summarised in a couple of sentences |
| "What's on my screen?" | Sends a frame of the window you shared to the model's vision and describes it. Press **S** once first to choose what to share |
| "What's happening in the world?" | Searches the headlines and gives you the top three |
| Anything else | A helpful answer delivered with sarcastic-butler wit |

Keys: **Space** push-to-talk, **V** cycle browser voices, **S** share/stop sharing screen, **Esc** interrupt.

The ring shows the state: slow breathing (idle), rippling (listening), a sweeping arc with orbiting beads (thinking), and radial pulses that follow the audio (speaking).

## 2b. Free setup with Gemini

1. Go to <https://aistudio.google.com/apikey>, sign in with a Google account and create an API key. No credit card is needed.
2. Put it in `.env`:

   ```
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=your-key
   ```
3. `npm install && npm run dev`, open <http://127.0.0.1:5173>. The browser voice is the free TTS default, so no other key is needed.

What to know about the free tier (checked against ai.google.dev in October 2026, so re-check before relying on it):

- **Limits.** Free keys are limited per project in requests per minute, tokens per minute and requests per day, and the limits differ by model. See your own limits at <https://aistudio.google.com/rate-limit>. When you hit one, the API answers HTTP 429. Jarvis retries up to three times with backoff, then says "I'm being rate-limited, sir. Give me a moment."
- **Your data.** On the free tier, Google states that your prompts and responses may be used to improve its products. The paid tier says otherwise. Do not point a free key at anything confidential: calendar and email results travel to Google with every question.
- **Web search.** Google Search grounding is not available on the free tier for Gemini 3.x models, but it is for `gemini-2.5-flash` (a daily request cap applies). So `web_search` runs as a separate grounded call to `GEMINI_SEARCH_MODEL` (default `gemini-2.5-flash`) while chat uses `gemini-3.8-flash`. If Google retires that model, set `GEMINI_SEARCH_MODEL` to another one.
- **Model names change.** If `gemini-3.8-flash` stops working, set `LLM_MODEL` to a current Flash model from <https://ai.google.dev/gemini-api/docs/models>.

## 2c. Switching providers

| Want | Set in `.env` |
| --- | --- |
| Gemini (default, free) | `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=...` |
| Claude | `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...` (optionally `LLM_MODEL=...`) |
| No key at all (canned replies, for UI work) | `LLM_PROVIDER=mock` |

Restart the bridge after changing it. If the chosen provider's key is missing, the bridge refuses to start and tells you which variable to set. The header link line and the bridge log show which provider is active.

Differences: with Gemini, the bridge itself connects to your MCP servers and runs the tool loop (at most 8 model-tool rounds per question). With Claude, the Claude Agent SDK runs its own tool loop with its own web search, and the bridge hands it your MCP servers. The Claude path needs the optional `@anthropic-ai/claude-agent-sdk` package, which `npm install` pulls in by default.

## 3. Choosing a voice

| Where | What it controls |
| --- | --- |
| `JARVIS_VOICE_ID` in `.env` | **The real control.** The ElevenLabs voice used whenever ElevenLabs is available |
| `V` key | Cycles the *browser* voices. Only matters in fallback mode; with ElevenLabs on it just tells you so |
| Browser/OS voice settings | Which voices `V` can cycle through |

Some ElevenLabs premade British voices to start with. These IDs are from memory, so confirm them in your own Voice Library (copy the ID from the voice's menu) before relying on them:

| Voice | Character | ID |
| --- | --- | --- |
| Daniel | Calm, authoritative British male | `onwK4e9ZLuTAKqWW03F9` |
| George | Warm British male | `JBFqnCBsd6RMkjVDRZzb` |
| Brian | Deep American male | `nPczCjzI2devNBz1zQrb` |

The page header shows `VOICE: ELEVENLABS` or `VOICE: BROWSER` so you can tell which is active. `GET /health` reports the same.

## 4. Google Calendar and Gmail

Jarvis uses the MCP servers listed in `./jarvis.mcp.json` (gitignored). If that file has none, it falls back to `mcpServers` in `~/.claude.json`. Same format as Claude's config: `{ "mcpServers": { "name": { "command": "npx", "args": ["..."] } } }`. Local (stdio) servers and remote servers that take a static header token are supported; remote servers that need an interactive OAuth login are not. To add Calendar and Gmail:

```bash
export GOOGLE_OAUTH_CREDENTIALS=/path/to/gcp-oauth.keys.json   # your Desktop-app OAuth client file
npm run mcp:add                 # dry run, explains each step
npm run mcp:add -- --write      # merge into ./jarvis.mcp.json
npx -y @gongrzhe/server-gmail-autoauth-mcp auth                # one-time browser consent, run locally
```

Calendar asks you to consent the first time it is used. The script reads the credentials *path* from the environment and never writes secrets itself. Restart the bridge afterwards. The bridge logs only server names, never their config.

## 5. Make it start itself

All three run `npm run dev` in this folder at login. Replace `/path/to/personal-jarvis` with your real path, then open <http://127.0.0.1:5173> (bookmark it, or pin the tab).

### Windows (Task Scheduler, at log on)

PowerShell:

```powershell
$dir = "C:\path\to\personal-jarvis"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$dir`" && npm run dev" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "JARVIS" -Action $action -Trigger $trigger -Description "JARVIS bridge and HUD"
```

Remove it with `Unregister-ScheduledTask -TaskName JARVIS -Confirm:$false`.

### macOS (launchd)

`~/Library/LaunchAgents/com.jarvis.assistant.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jarvis.assistant</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd /path/to/personal-jarvis &amp;&amp; npm run dev</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/jarvis.log</string>
  <key>StandardErrorPath</key><string>/tmp/jarvis.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.jarvis.assistant.plist
```

(`zsh -l` gives launchd the PATH your Node install needs.)

### Linux (systemd user unit)

`~/.config/systemd/user/jarvis.service`:

```ini
[Unit]
Description=JARVIS bridge and HUD

[Service]
WorkingDirectory=/path/to/personal-jarvis
ExecStart=/usr/bin/env npm run dev
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now jarvis.service
journalctl --user -u jarvis -f      # logs
```

If `npm` is installed through nvm, use its absolute path in `ExecStart`.

## 6. Troubleshooting

**Windows: "spawn ... ENOENT" or an MCP server never connects.** Tools such as `npx` and the Claude CLI are `.cmd` shims on Windows, and Node can only start those through a shell. The Claude provider spawns the CLI with `shell:true` on Windows. For MCP servers use `cmd /c npx ...` in `jarvis.mcp.json` (which is what `npm run mcp:add` writes).

**"JARVIS cannot start: ... GEMINI_API_KEY is not set".** Add the key to `.env` (or `LLM_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`) and run `npm run dev` again.

**Jarvis says "I can't seem to authenticate with my brain".** The API key was rejected. Re-copy it from AI Studio, with no quotes or spaces, and restart the bridge.

**The mic does nothing.** Use Chrome or Edge on `http://127.0.0.1:5173` or `http://localhost:5173`, click the padlock and allow the microphone, then reload. Also check the OS-level mic permission for the browser, and that no other tab or app has the mic. A "Microphone blocked" notice on screen means the browser said no.

**Wake word is flaky.** Browser speech recognition needs an internet connection and mishears sometimes. Push-to-talk (Space) always works. While Jarvis is speaking he stops listening, so you cannot talk over him; press Esc or Space to interrupt.

**I edited `.env` or the MCP config and nothing changed.** The bridge reads `.env`, `jarvis.mcp.json` and `~/.claude.json` only at boot. Stop it (Ctrl+C) and run `npm run dev` again.

**Voice says BROWSER but I set ElevenLabs keys.** Both `ELEVENLABS_API_KEY` and `JARVIS_VOICE_ID` must be set, and the bridge restarted. Check `http://127.0.0.1:8787/health`. If ElevenLabs errors mid-session, Jarvis falls back to the browser voice for that sentence.

**"What's on my screen?" asks for permission.** Browsers only allow screen capture after a click or key press. Press **S**, pick a window or screen, then ask.

**"Bridge offline" / LINK OFFLINE.** The bridge is not running or crashed; look at the terminal running `npm run dev`. It binds to `127.0.0.1` only, so it is not reachable from other machines by design.

## Development

```bash
npm test             # unit tests, all keyless (mock provider). A live Gemini smoke test runs only if GEMINI_API_KEY is set
npm run typecheck
npm run smoke        # boots the bridge and hits /health
npm run screenshots  # headless HUD screenshots into docs/screenshots/
```

Security notes: the bridge listens on `127.0.0.1` only, refuses non-local `Host`/`Origin` headers, keeps `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` server-side (the browser never sees them), never logs MCP config contents, and gives the model only web search, the clock and your MCP tools (no shell, no file access).
