import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';

// With shell:true Node joins args unquoted, so quote anything cmd.exe would split.
const quote = (a) => (/[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/**
 * Spawner for the Claude Code CLI. On Windows the CLI is often a .cmd shim,
 * which only runs through a shell, so we pass shell:true there.
 */
export function spawnClaudeCodeProcess({ command, args, cwd, env, signal }) {
  const child = isWindows
    ? spawn(quote(command), args.map(quote), { cwd, env, signal, shell: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    : spawn(command, args, { cwd, env, signal, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr?.resume();
  return child;
}
