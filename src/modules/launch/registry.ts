import * as fs from 'fs';
import * as path from 'path';
import { loadConfigStrict, saveConfig } from '../../utils/config';
import type { LaunchEntry, LaunchShell, LaunchStart } from '../../types';

const SCRIPT_EXTENSIONS = ['.cmd', '.bat', '.ps1'];
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export interface AddLaunchInput {
  path: string;
  id?: string;
  name?: string;
  start?: string;
  kind?: LaunchStart['kind'];
  shell?: string;
  keepOpen?: boolean;
}

export interface BuiltEntry {
  entry: LaunchEntry;
  warnings: string[];
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

export function slugifyId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

function isScriptFile(candidate: string): boolean {
  if (!SCRIPT_EXTENSIONS.includes(path.extname(candidate).toLowerCase())) return false;
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

// A start value is a script only when it is an existing .cmd/.bat/.ps1 file; anything else runs as a shell command.
export function classifyStart(raw: string, projectDir: string): LaunchStart {
  const value = raw.trim();
  const absolute = path.isAbsolute(value) ? value : path.resolve(projectDir, value);
  if (!isScriptFile(absolute)) return { kind: 'command', value };

  const relative = path.relative(projectDir, absolute);
  const insideProject = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return { kind: 'script', value: toPosix(insideProject ? relative : absolute) };
}

function resolveShell(requested: string | undefined, start: LaunchStart | undefined): LaunchShell {
  if (requested !== undefined) {
    if (requested !== 'cmd' && requested !== 'powershell') {
      throw new Error(`不支持的 shell：${requested}（可选 cmd / powershell）`);
    }
    return requested;
  }
  return start?.kind === 'script' && start.value.toLowerCase().endsWith('.ps1') ? 'powershell' : 'cmd';
}

export function assertDirectory(target: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new Error(`路径不存在：${target}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`路径不是目录：${target}`);
  }
}

export function buildEntry(input: AddLaunchInput, existing: Array<Pick<LaunchEntry, 'id'>>): BuiltEntry {
  const warnings: string[] = [];

  if (!path.isAbsolute(input.path)) {
    throw new Error(`请提供绝对路径：${input.path}`);
  }
  const resolved = path.resolve(input.path);
  assertDirectory(resolved);

  const id = input.id ?? slugifyId(path.basename(resolved));
  if (!id) {
    throw new Error('无法从目录名生成 id，请用 --id 指定');
  }
  if (!isValidId(id)) {
    throw new Error(`id 只能包含小写字母、数字、- 和 _，且不能以符号开头：${id}`);
  }
  if (existing.some((item) => item.id === id)) {
    throw new Error(`id 已存在：${id}`);
  }

  let start: LaunchStart | undefined;
  if (input.start !== undefined && input.start.trim()) {
    start = input.kind === 'command'
      ? { kind: 'command', value: input.start.trim() }
      : classifyStart(input.start, resolved);

    if (input.kind === 'script') {
      const value = input.start.trim();
      const absolute = path.isAbsolute(value) ? value : path.resolve(resolved, value);
      if (!isScriptFile(absolute)) {
        warnings.push(`脚本文件不存在或不是 .cmd/.bat/.ps1：${value}`);
      }
      start = { kind: 'script', value: start.kind === 'script' ? start.value : toPosix(value) };
    }
  }

  const entry: LaunchEntry = {
    id,
    name: input.name?.trim() || path.basename(resolved),
    path: toPosix(resolved),
    shell: resolveShell(input.shell, start),
    keepOpen: input.keepOpen ?? true,
  };
  if (start) entry.start = start;

  return { entry, warnings };
}

export function listLaunch(): LaunchEntry[] {
  const launch = loadConfigStrict().launch;
  return Array.isArray(launch) ? launch : [];
}

export function findLaunch(id: string): LaunchEntry | undefined {
  return listLaunch().find((item) => item.id === id);
}

export function addLaunch(input: AddLaunchInput): BuiltEntry {
  const config = loadConfigStrict();
  const current = Array.isArray(config.launch) ? config.launch : [];
  const built = buildEntry(input, current);
  config.launch = [...current, built.entry];
  saveConfig(config);
  return built;
}

export function removeLaunch(id: string): LaunchEntry {
  const config = loadConfigStrict();
  const current = Array.isArray(config.launch) ? config.launch : [];
  const target = current.find((item) => item.id === id);
  if (!target) {
    throw new Error(`未找到 id：${id}`);
  }
  config.launch = current.filter((item) => item.id !== id);
  saveConfig(config);
  return target;
}

function describeStart(start: LaunchStart | undefined): string {
  if (!start) return '—';
  return start.kind === 'script' ? `[脚本] ${start.value}` : start.value;
}

export function formatLaunchList(entries: LaunchEntry[], options: { json: boolean }): string {
  if (options.json) return JSON.stringify(entries, null, 2);

  if (entries.length === 0) {
    return '还没有注册任何路径。用 `hi path add <路径> --start <命令或脚本>` 添加。';
  }

  const rows = entries.map((item) => [item.id, item.name, item.path, describeStart(item.start)]);
  const header = ['ID', '名称', '路径', '启动'];
  const widths = header.map((title, column) =>
    Math.max(displayWidth(title), ...rows.map((row) => displayWidth(row[column]))),
  );
  const render = (cells: string[]) => cells.map((cell, column) => padDisplay(cell, widths[column])).join('  ').trimEnd();

  return [render(header), ...rows.map(render)].join('\n');
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    width += code > 0x2e7f ? 2 : 1;
  }
  return width;
}

function padDisplay(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}
