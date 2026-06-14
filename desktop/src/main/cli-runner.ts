import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import { validateDesktopCommand } from './permissions';

export interface CliRunResult {
  ok: boolean;
  output: string;
}

const CLI_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 256_000;

function trimCliOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n\n[output truncated after ${MAX_OUTPUT_CHARS} characters]`;
}

export function runDesktopCli(command: string): Promise<CliRunResult> {
  const validation = validateDesktopCommand(command);
  if (!validation.allowed) {
    return Promise.resolve({ ok: false, output: validation.reason || `Command not allowed: ${command}` });
  }

  const [entrypoint, ...args] = validation.normalized.split(/\s+/).filter(Boolean);
  const cliPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'cli', 'index.js')
    : path.resolve(__dirname, '..', '..', '..', 'dist', 'index.js');

  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let child: ChildProcessWithoutNullStreams | null = null;

    const finish = (result: CliRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({ ok: result.ok, output: trimCliOutput(result.output) });
    };

    child = spawn(process.execPath, [cliPath, `--${entrypoint}`, ...args], {
      cwd: path.resolve(__dirname, '..', '..', '..'),
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });

    const timeoutHandle = setTimeout(() => {
      child?.kill();
      finish({
        ok: false,
        output: `${output}\n\nCommand timed out after ${Math.round(CLI_TIMEOUT_MS / 1000)} seconds.`,
      });
    }, CLI_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.on('error', (error) => finish({ ok: false, output: error.message }));
    child.on('close', (code) => finish({ ok: code === 0, output: output || (code === 0 ? 'Done.' : 'Command failed.') }));
  });
}
