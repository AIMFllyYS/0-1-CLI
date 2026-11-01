import * as fs from 'fs';
import * as path from 'path';
import type { LaunchStart } from '../../types';

export interface StartSuggestion extends LaunchStart {
  reason: string;
}

export const STATIC_SERVER_COMMAND = 'python -m http.server 8848';

const SCRIPT_CANDIDATES = ['start.cmd', 'start.bat', 'start.ps1', 'run.cmd', 'run.bat', 'run.ps1'];

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function hasDevScript(packageJson: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8').replace(/^\uFEFF/, ''));
    return typeof pkg?.scripts?.dev === 'string';
  } catch {
    return false;
  }
}

// Suggests a start value for a directory. Only well-known shapes are matched; anything else returns undefined.
export function probeStart(dir: string): StartSuggestion | undefined {
  for (const name of SCRIPT_CANDIDATES) {
    if (isFile(path.join(dir, name))) {
      return { kind: 'script', value: name, reason: `检测到启动脚本 ${name}` };
    }
  }

  const packageJson = path.join(dir, 'package.json');
  if (isFile(packageJson)) {
    return hasDevScript(packageJson)
      ? { kind: 'command', value: 'npm run dev', reason: '检测到 package.json 的 dev 脚本' }
      : undefined;
  }

  if (isFile(path.join(dir, 'index.html'))) {
    return {
      kind: 'command',
      value: STATIC_SERVER_COMMAND,
      reason: '检测到 index.html 且没有 package.json（纯静态站）',
    };
  }

  return undefined;
}
