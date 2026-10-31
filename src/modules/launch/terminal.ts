import * as fs from 'fs';
import * as path from 'path';
import { spawn as nodeSpawn } from 'child_process';
import type { ChildProcess, SpawnOptions } from 'child_process';
import type { LaunchEntry } from '../../types';

export interface TerminalPlan {
  terminal: 'wt' | 'cmd';
  command: string;
  args: string[];
  options: SpawnOptions;
}

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface LaunchDeps {
  spawn?: SpawnFn;
  platform?: NodeJS.Platform;
}

// wt treats `;` as its own command separator, so a literal one must be written `\;`.
function escapeWt(value: string): string {
  return value.replace(/;/g, '\\;');
}

function resolveScript(entry: LaunchEntry): string {
  return path.resolve(entry.path, entry.start?.value ?? '');
}

function buildLine(entry: LaunchEntry): string | undefined {
  const start = entry.start;
  if (!start) return undefined;
  if (start.kind === 'command') return start.value;

  const script = resolveScript(entry);
  if (entry.shell === 'powershell') return `& '${script.replace(/'/g, "''")}'`;
  if (script.toLowerCase().endsWith('.ps1')) return `powershell -NoLogo -File "${script}"`;
  return `"${script}"`;
}

function powershellArgs(entry: LaunchEntry, line: string | undefined, escape: (value: string) => string): string[] {
  if (line === undefined) return ['-NoLogo', '-NoExit'];
  return ['-NoLogo', ...(entry.keepOpen ? ['-NoExit'] : []), '-Command', escape(line)];
}

export function planWindowsTerminal(entry: LaunchEntry): TerminalPlan {
  const line = buildLine(entry);
  const head = ['-d', escapeWt(entry.path), '--title', escapeWt(entry.name)];

  const shellArgs = entry.shell === 'powershell'
    ? ['powershell', ...powershellArgs(entry, line, escapeWt)]
    : line === undefined
      ? ['cmd', '/k']
      : ['cmd', entry.keepOpen ? '/k' : '/c', escapeWt(line)];

  return {
    terminal: 'wt',
    command: 'wt.exe',
    args: [...head, ...shellArgs],
    options: { detached: true, stdio: 'ignore' },
  };
}

export function planCmdFallback(entry: LaunchEntry): TerminalPlan {
  const line = buildLine(entry);
  const cwd = path.resolve(entry.path);

  if (entry.shell === 'powershell') {
    return {
      terminal: 'cmd',
      command: 'powershell.exe',
      args: powershellArgs(entry, line, (value) => value),
      options: { cwd, detached: true, stdio: 'ignore' },
    };
  }

  const args = line === undefined
    ? ['/d', '/k']
    : ['/d', '/s', entry.keepOpen ? '/k' : '/c', `"${line}"`];

  return {
    terminal: 'cmd',
    command: 'cmd.exe',
    args,
    options: { cwd, detached: true, stdio: 'ignore', windowsVerbatimArguments: true },
  };
}

function assertLaunchable(entry: LaunchEntry, platform: NodeJS.Platform): void {
  if (platform !== 'win32') {
    throw new Error('hi run 目前仅支持 Windows');
  }
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(entry.path);
  } catch {
    stat = undefined;
  }
  if (!stat?.isDirectory()) {
    throw new Error(`项目目录不存在：${entry.path}`);
  }
  if (entry.start?.kind === 'script') {
    const script = resolveScript(entry);
    if (!fs.existsSync(script)) {
      throw new Error(`脚本不存在：${script}`);
    }
  }
}

// Validates the entry and returns the plan for the preferred terminal without starting anything.
export function planLaunch(entry: LaunchEntry, platform: NodeJS.Platform = process.platform): TerminalPlan {
  assertLaunchable(entry, platform);
  return planWindowsTerminal(entry);
}

function spawnPlan(spawn: SpawnFn, plan: TerminalPlan): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(plan.command, plan.args, plan.options);
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.removeListener('error', reject);
      child.on('error', () => {});
      child.unref();
      resolve();
    });
  });
}

export async function launchEntry(
  entry: LaunchEntry,
  deps: LaunchDeps = {},
): Promise<{ terminal: TerminalPlan['terminal']; plan: TerminalPlan }> {
  const spawn = deps.spawn ?? (nodeSpawn as SpawnFn);
  assertLaunchable(entry, deps.platform ?? process.platform);

  const preferred = planWindowsTerminal(entry);
  try {
    await spawnPlan(spawn, preferred);
    return { terminal: 'wt', plan: preferred };
  } catch (wtError) {
    const fallback = planCmdFallback(entry);
    try {
      await spawnPlan(spawn, fallback);
      return { terminal: 'cmd', plan: fallback };
    } catch (cmdError) {
      const reason = (cmdError as Error).message || (wtError as Error).message;
      throw new Error(`无法启动终端：${reason}`);
    }
  }
}
