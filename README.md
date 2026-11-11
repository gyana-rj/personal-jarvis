# Build Your Own Jarvis - Full Setup Guide

A personal voice assistant that runs in your browser: a dry British butler with a glowing HUD, wake word, calendar, web search and screen vision.

- **Brain:** Claude via the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk), plus any MCP servers in your `~/.claude.json`
- **Voice out:** ElevenLabs (falls back to your browser's built-in voices)
- **Voice in:** Web Speech API (use **Chrome or Edge**; Firefox has no speech recognition)
- **Bridge:** a small Node server on `127.0.0.1` that keeps your keys off the web page

```
browser (Vite, :5173) --WebSocket/HTTP--> bridge (127.0.0.1:8787) --> Claude Agent SDK --> MCP tools
                                                         `--> ElevenLabs (key stays server-side)
```

## 1. Install

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env      # then fill it in
npm run dev               # starts the bridge and the web app
```

Open <http://127.0.0.1:5173> in Chrome or Edge and allow the microphone.

`.env`:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Lets the Agent SDK call Claude |
| `ELEVENLABS_API_KEY` | Optional. Without it Jarvis uses a browser voice |
| `JARVIS_VOICE_ID` | Optional. Which ElevenLabs voice to use |
| `BRIDGE_PORT` | Optional. Default `8787` |
| `JARVIS_MODEL` | Optional. Override the Claude model |

The bridge reads `.env` once at boot, so **restart it after editing**.

## 2. Try these first

| Say | What happens |
| --- | --- |
| "Hey Jarvis" (then your request) | Wake word. The ring switches to *listening*, then your words go to Claude |
| Hold **Space**, speak, release | Push-to-talk, no wake word needed |
| "Good morning, Jarvis" | Morning briefing: weather, today's calendar and any tasks. Calendar events also open as a HUD panel |
| "Search for AI news" | Web search, summarised in a couple of sentences |
| "What's on my screen?" | Takes a frame of the window you shared and describes it. Press **S** once first to choose what to share |
| "What's happening in the world?" | Searches the headlines and gives you the top three |
| Anything else | A helpful answer delivered with sarcastic-butler wit |

Keys: **Space** push-to-talk, **V** cycle browser voices, **S** share/stop sharing screen, **Esc** interrupt.

The ring shows the state: slow breathing (idle), rippling (listening), a sweeping arc with orbiting beads (thinking), and radial pulses that follow the audio (speaking).

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

Jarvis uses whichever MCP servers are in `~/.claude.json`. To add Calendar and Gmail:

```bash
export GOOGLE_OAUTH_CREDENTIALS=/path/to/gcp-oauth.keys.json   # your Desktop-app OAuth client file
npm run mcp:add                 # dry run, explains each step
npm run mcp:add -- --write      # merge into ~/.claude.json (a backup is kept)
npx -y @gongrzhe/server-gmail-autoauth-mcp auth                # one-time browser consent, run locally
```

Calendar asks you to consent the first time it is used. The script reads the credentials *path* from the environment and never writes secrets itself. Restart the bridge afterwards.

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

**Windows: "spawn ... ENOENT" or the agent never answers.** Tools such as `npx` and the Claude CLI are `.cmd` shims on Windows, and Node can only start those through a shell. The bridge already spawns with `shell:true` on Windows. If you start your own commands, use `cmd /c npx ...` (which is what `npm run mcp:add` writes).

**The mic does nothing.** Use Chrome or Edge on `http://127.0.0.1:5173` or `http://localhost:5173`, click the padlock and allow the microphone, then reload. Also check the OS-level mic permission for the browser, and that no other tab or app has the mic. A "Microphone blocked" notice on screen means the browser said no.

**Wake word is flaky.** Browser speech recognition needs an internet connection and mishears sometimes. Push-to-talk (Space) always works. While Jarvis is speaking he stops listening, so you cannot talk over him; press Esc or Space to interrupt.

**I edited `.env` or `~/.claude.json` and nothing changed.** The bridge reads both only at boot. Stop it (Ctrl+C) and run `npm run dev` again.

**Voice says BROWSER but I set ElevenLabs keys.** Both `ELEVENLABS_API_KEY` and `JARVIS_VOICE_ID` must be set, and the bridge restarted. Check `http://127.0.0.1:8787/health`. If ElevenLabs errors mid-session, Jarvis falls back to the browser voice for that sentence.

**"What's on my screen?" asks for permission.** Browsers only allow screen capture after a click or key press. Press **S**, pick a window or screen, then ask.

**"Bridge offline" / LINK OFFLINE.** The bridge is not running or crashed; look at the terminal running `npm run dev`. It binds to `127.0.0.1` only, so it is not reachable from other machines by design.

## Development

```bash
npm test             # unit tests (MCP config, TTS fallback, HUD tags, wake word, ...)
npm run typecheck
npm run smoke        # boots the bridge and hits /health
npm run screenshots  # headless HUD screenshots into docs/screenshots/
```

Security notes: the bridge refuses non-local `Host`/`Origin` headers, never logs `~/.claude.json`, and gives the agent only web search, web fetch and your MCP tools (no shell, no file access).
