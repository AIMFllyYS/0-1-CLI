import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const STARTUP_FILE_NAME = 'hi-cli-autostart.cmd';

export interface AutostartDeps {
  startupDir?: string;
  platform?: NodeJS.Platform;
  nodePath?: string;
  entryPath?: string;
  home?: string;
}

// These characters are special to batch files or to wt's own argument parser.
const UNSAFE_PATH_CHARS = /[%&^;"!<>|]/;

function assertSafePath(label: string, value: string): void {
  if (UNSAFE_PATH_CHARS.test(value)) {
    throw new Error(`${label}含有不支持的字符（% & ^ ; " ! < > |）：${value}`);
  }
}

export function resolveStartupDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HI_STARTUP_DIR) return env.HI_STARTUP_DIR;
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

export function buildStartupScript(input: { nodePath: string; entryPath: string; home: string }): string {
  assertSafePath('Node 路径', input.nodePath);
  assertSafePath('hi 入口路径', input.entryPath);
  assertSafePath('主目录', input.home);

  const command = `"${input.nodePath}" "${input.entryPath}"`;
  return [
    '@echo off',
    'chcp 65001 >nul',
    'rem Created by `hi config set startup.cliAutostart on`.',
    'rem Remove with `hi config set startup.cliAutostart off`.',
    'where wt.exe >nul 2>nul',
    'if %errorlevel%==0 (',
    `  start "" wt.exe -d "${input.home}" cmd /d /s /k "${command}"`,
    ') else (',
    `  start "" /d "${input.home}" cmd /d /s /k "${command}"`,
    ')',
    '',
  ].join('\r\n');
}

function resolveDeps(deps: AutostartDeps) {
  return {
    startupDir: deps.startupDir ?? resolveStartupDir(),
    platform: deps.platform ?? process.platform,
    nodePath: deps.nodePath ?? process.execPath,
    entryPath: deps.entryPath ?? path.resolve(__dirname, '..', 'index.js'),
    home: deps.home ?? os.homedir(),
  };
}

function targetFile(startupDir: string): string {
  return path.join(startupDir, STARTUP_FILE_NAME);
}

export function isAutostartEnabled(deps: AutostartDeps = {}): boolean {
  return fs.existsSync(targetFile(resolveDeps(deps).startupDir));
}

export function enableAutostart(deps: AutostartDeps = {}): string {
  const resolved = resolveDeps(deps);
  if (resolved.platform !== 'win32') {
    throw new Error('CLI 开机启动目前仅支持 Windows');
  }
  if (!fs.existsSync(resolved.startupDir)) {
    throw new Error(`找不到系统启动文件夹：${resolved.startupDir}`);
  }

  const script = buildStartupScript(resolved);
  const file = targetFile(resolved.startupDir);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, script, 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

export function disableAutostart(deps: AutostartDeps = {}): boolean {
  const resolved = resolveDeps(deps);
  const file = targetFile(resolved.startupDir);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}
