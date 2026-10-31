import * as fs from 'fs';
import * as path from 'path';
import type { LaunchEntry } from '../types';

const CONFIG_PATH = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.coding-cli.json');

export interface CliConfig {
  projectRoot?: string;
  launch?: LaunchEntry[];
}

export class ConfigParseError extends Error {
  constructor(public readonly file: string, cause: unknown) {
    super(`配置文件无法解析，已拒绝写入以免覆盖：${file}（${cause instanceof Error ? cause.message : String(cause)}）`);
    this.name = 'ConfigParseError';
  }
}

export function loadConfig(): CliConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

// Missing file is an empty config; an unreadable or corrupt file must not be mistaken for one.
export function loadConfigStrict(): CliConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigParseError(CONFIG_PATH, error);
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('顶层必须是 JSON 对象');
    }
    return parsed as CliConfig;
  } catch (error) {
    throw new ConfigParseError(CONFIG_PATH, error);
  }
}

export function saveConfig(config: CliConfig): void {
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, CONFIG_PATH);
}

export function getProjectRoot(): string {
  return loadConfig().projectRoot || '';
}
