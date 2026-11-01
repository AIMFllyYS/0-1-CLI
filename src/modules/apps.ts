import * as fs from 'fs';
import { renderMarkdown } from '../utils/markdown';
import { listLaunch } from './launch/registry';
import type { LaunchEntry } from '../types';

export interface AppInfo {
  name: string;
  exe: string;
  paths: string[];
  launchCmd: string;
  description: string;
}

type Env = Record<string, string | undefined>;

export interface DetectDeps {
  env?: Env;
  exists?: (target: string) => boolean;
  readdir?: (dir: string) => string[];
}

export interface DetectedApp {
  app: AppInfo;
  foundPath: string | null;
}

export const APP_CATALOG: AppInfo[] = [
  {
    name: 'VS Code',
    exe: 'code',
    paths: [
      '%LOCALAPPDATA%/Programs/Microsoft VS Code/Code.exe',
      '%PROGRAMFILES%/Microsoft VS Code/Code.exe',
    ],
    launchCmd: 'code .',
    description: 'Code editor',
  },
  {
    name: 'Cursor',
    exe: 'cursor',
    paths: [
      '%LOCALAPPDATA%/Programs/cursor/Cursor.exe',
      '%LOCALAPPDATA%/Cursor/app-*/Cursor.exe',
      '%PROGRAMFILES%/Cursor/Cursor.exe',
    ],
    launchCmd: 'cursor .',
    description: 'AI-first code editor',
  },
  {
    name: 'Windows Terminal',
    exe: 'wt',
    paths: ['%LOCALAPPDATA%/Microsoft/WindowsApps/wt.exe'],
    launchCmd: 'wt',
    description: 'Windows terminal',
  },
  {
    name: 'Chrome',
    exe: 'chrome',
    paths: [
      '%PROGRAMFILES%/Google/Chrome/Application/chrome.exe',
      '%PROGRAMFILES(X86)%/Google/Chrome/Application/chrome.exe',
      '%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe',
    ],
    launchCmd: 'start chrome',
    description: 'Web browser',
  },
  {
    name: 'Edge',
    exe: 'msedge',
    paths: [
      '%PROGRAMFILES(X86)%/Microsoft/Edge/Application/msedge.exe',
      '%PROGRAMFILES%/Microsoft/Edge/Application/msedge.exe',
    ],
    launchCmd: 'start msedge',
    description: 'Microsoft Edge browser',
  },
  {
    name: 'GitHub Desktop',
    exe: 'github',
    paths: ['%LOCALAPPDATA%/GitHubDesktop/GitHubDesktop.exe'],
    launchCmd: 'github',
    description: 'Git GUI client',
  },
  {
    name: 'Node.js',
    exe: 'node',
    paths: [
      '%PROGRAMFILES%/nodejs/node.exe',
      '%PROGRAMFILES(X86)%/nodejs/node.exe',
    ],
    launchCmd: 'node',
    description: 'JavaScript runtime',
  },
  {
    name: 'Python',
    exe: 'python',
    paths: [
      '%LOCALAPPDATA%/Programs/Python/Python*/python.exe',
      '%SYSTEMDRIVE%/Python*/python.exe',
    ],
    launchCmd: 'python',
    description: 'Python runtime',
  },
  {
    name: 'Claude Code',
    exe: 'claude',
    paths: ['%APPDATA%/npm/claude.cmd'],
    launchCmd: 'claude',
    description: 'Anthropic CLI',
  },
  {
    name: 'Kiro',
    exe: 'kiro-cli',
    paths: ['%LOCALAPPDATA%/Kiro-Cli/kiro-cli.exe'],
    launchCmd: 'kiro-cli',
    description: 'Kiro CLI (AI coding)',
  },
  {
    name: 'File Explorer',
    exe: 'explorer',
    paths: ['%SYSTEMROOT%/explorer.exe'],
    launchCmd: 'explorer .',
    description: 'File explorer',
  },
  {
    name: 'Notepad',
    exe: 'notepad',
    paths: ['%SYSTEMROOT%/System32/notepad.exe', '%SYSTEMROOT%/notepad.exe'],
    launchCmd: 'notepad',
    description: 'Text editor',
  },
  {
    name: 'PowerShell 7',
    exe: 'pwsh',
    paths: ['%PROGRAMFILES%/PowerShell/7/pwsh.exe'],
    launchCmd: 'pwsh',
    description: 'PowerShell 7 terminal',
  },
  {
    name: 'Windows PowerShell',
    exe: 'powershell',
    paths: ['%SYSTEMROOT%/System32/WindowsPowerShell/v1.0/powershell.exe'],
    launchCmd: 'powershell',
    description: 'Built-in PowerShell terminal',
  },
];

// lstat rather than existsSync: App Execution Aliases (e.g. wt.exe) cannot be stat'ed but do exist.
export function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function readDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function getEnv(env: Env, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === wanted);
  return key === undefined ? undefined : env[key] || undefined;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

export function resolveOnPath(name: string, env: Env, exists: (target: string) => boolean): string | null {
  const dirs = (getEnv(env, 'PATH') ?? '')
    .split(';')
    .map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
  const extensions = (getEnv(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean);

  for (const dir of dirs) {
    const base = toPosix(dir).replace(/\/+$/, '');
    for (const ext of extensions) {
      const candidate = `${base}/${name}${ext}`;
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

function globToRegExp(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

// Expands %VAR% references and `*` path segments; the newest-looking directory name comes first.
export function expandCandidates(
  template: string,
  env: Env,
  readdir: (dir: string) => string[] = readDirSafe,
): string[] {
  let missing = false;
  const substituted = template.replace(/%([^%]+)%/g, (_match, name: string) => {
    const value = getEnv(env, name);
    if (value === undefined) missing = true;
    return value ?? '';
  });
  if (missing) return [];

  const segments = toPosix(substituted).split('/').filter((segment) => segment !== '');

  const walk = (prefix: string, rest: string[]): string[] => {
    if (rest.length === 0) return [prefix];
    const [segment, ...tail] = rest;
    const join = (name: string) => (prefix === '' ? name : prefix.endsWith('/') ? prefix + name : `${prefix}/${name}`);

    if (!segment.includes('*')) return walk(join(segment), tail);

    const pattern = globToRegExp(segment);
    const listing = prefix.endsWith(':') ? `${prefix}/` : prefix;
    return readdir(listing)
      .filter((name) => pattern.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .flatMap((name) => walk(join(name), tail));
  };

  return walk('', segments);
}

export function detectApps(deps: DetectDeps = {}): DetectedApp[] {
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? pathExists;
  const readdir = deps.readdir ?? readDirSafe;

  return APP_CATALOG.map((app) => {
    const onPath = resolveOnPath(app.exe, env, exists);
    if (onPath) return { app, foundPath: onPath };

    for (const template of app.paths) {
      const hit = expandCandidates(template, env, readdir).find((candidate) => exists(candidate));
      if (hit) return { app, foundPath: hit };
    }
    return { app, foundPath: null };
  });
}

function cell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function registeredSection(): string[] {
  let entries: LaunchEntry[];
  try {
    entries = listLaunch();
  } catch (error) {
    return ['### 已注册路径', '', `⚠ ${(error as Error).message}`, ''];
  }

  if (entries.length === 0) {
    return ['### 已注册路径', '', '还没有注册。用 `hi path add <路径> --start <命令或脚本>` 添加，然后 `hi run <id>` 启动。', ''];
  }

  const md = [
    '### 已注册路径',
    '',
    '| 状态 | ID | 名称 | 启动 | 路径 |',
    '| :---: | --- | --- | --- | --- |',
  ];
  for (const entry of entries) {
    const status = pathExists(entry.path) ? '✓' : '✗';
    md.push(`| ${status} | ${cell(entry.id)} | ${cell(entry.name)} | \`hi run ${cell(entry.id)}\` | ${cell(entry.path)} |`);
  }
  md.push('');
  return md;
}

export function getApps(): string {
  const md: string[] = [
    '## App Launch Commands',
    '',
    '| 状态 | 应用 | 启动命令 | 说明 | 路径 |',
    '| :---: | --- | --- | --- | --- |',
  ];

  for (const { app, foundPath } of detectApps()) {
    const status = foundPath ? '✓' : '○';
    const pathStr = foundPath ?? '—';
    md.push(`| ${status} | ${app.name} | \`${app.launchCmd}\` | ${app.description} | ${cell(pathStr)} |`);
  }

  md.push('');
  md.push(...registeredSection());
  md.push('### 💡 Quick Launch Examples');
  md.push('');
  md.push('- `code .` — Open VS Code here');
  md.push('- `cursor .` — Open Cursor here');
  md.push('- `explorer .` — Open File Explorer here');
  md.push('- `wt` — Open Windows Terminal here');
  md.push('- `start chrome` — Open Chrome');
  md.push('- `hi run <id>` — 在新终端中启动已注册路径');

  return renderMarkdown(md.join('\n'));
}
