import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface AppInfo {
  name: string;
  paths: string[];
  launchCmd: string;
  description: string;
}

// Use dynamic home directory instead of hardcoded user path
const HOME = os.homedir().replace(/\\/g, '/');
const LOCALAPPDATA = (process.env.LOCALAPPDATA || `${HOME}/AppData/Local`).replace(/\\/g, '/');
const APPDATA = (process.env.APPDATA || `${HOME}/AppData/Roaming`).replace(/\\/g, '/');

const COMMON_APPS: AppInfo[] = [
  {
    name: 'VS Code',
    paths: [
      `${LOCALAPPDATA}/Programs/Microsoft VS Code/Code.exe`,
      'C:/Program Files/Microsoft VS Code/Code.exe'
    ],
    launchCmd: 'code .',
    description: 'Code editor'
  },
  {
    name: 'Cursor',
    paths: [
      `${LOCALAPPDATA}/Cursor/app-*/Cursor.exe`,
      'C:/Program Files/Cursor/Cursor.exe'
    ],
    launchCmd: 'cursor .',
    description: 'AI-first code editor'
  },
  {
    name: 'Windows Terminal',
    paths: [
      `${LOCALAPPDATA}/Microsoft/WindowsApps/wt.exe`,
      'C:/Windows/System32/windowsterminal.exe'
    ],
    launchCmd: 'wt',
    description: 'Windows terminal'
  },
  {
    name: 'Chrome',
    paths: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      `${LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`
    ],
    launchCmd: 'start chrome',
    description: 'Web browser'
  },
  {
    name: 'Edge',
    paths: [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
    ],
    launchCmd: 'start msedge',
    description: 'Microsoft Edge browser'
  },
  {
    name: 'GitHub Desktop',
    paths: [
      `${LOCALAPPDATA}/GitHubDesktop/GitHubDesktop.exe`,
      'C:/Program Files/GitHub Desktop/GitHubDesktop.exe'
    ],
    launchCmd: 'github',
    description: 'Git GUI client'
  },
  {
    name: 'Node.js',
    paths: [
      'C:/Program Files/nodejs/node.exe',
      'C:/Program Files (x86)/nodejs/node.exe'
    ],
    launchCmd: 'node',
    description: 'JavaScript runtime'
  },
  {
    name: 'Python',
    paths: [
      `${LOCALAPPDATA}/Programs/Python/Python*/python.exe`,
      'C:/Python*/python.exe'
    ],
    launchCmd: 'python',
    description: 'Python runtime'
  },
  {
    name: 'Claude Code',
    paths: [
      `${APPDATA}/npm/claude.cmd`,
      'C:/Program Files/claude/bin/claude.cmd'
    ],
    launchCmd: 'claude',
    description: 'Anthropic CLI'
  },
  {
    name: 'Kiro',
    paths: [],
    launchCmd: 'kiro-cli',
    description: 'Kiro CLI (AI coding)'
  },
  {
    name: 'File Explorer',
    paths: [
      'C:/Windows/explorer.exe'
    ],
    launchCmd: 'explorer .',
    description: 'File explorer'
  },
  {
    name: 'Notepad',
    paths: [
      'C:/Windows/notepad.exe'
    ],
    launchCmd: 'notepad',
    description: 'Text editor'
  },
  {
    name: 'PowerShell',
    paths: [
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      'C:/Windows/System32/WindowsPowerShell/v1.0/pwsh.exe'
    ],
    launchCmd: 'pwsh',
    description: 'PowerShell terminal'
  }
];

function findAppPath(app: AppInfo): string | null {
  if (app.paths.length === 0) return null;

  for (const p of app.paths) {
    if (p.includes('*')) {
      const baseDir = path.dirname(p);
      try {
        if (fs.existsSync(baseDir)) {
          const files = fs.readdirSync(baseDir);
          const match = files.find(f => path.basename(p).replace('*', '') === f.substring(0, path.basename(p).indexOf('*') > -1 ? path.basename(p).indexOf('*') : f.length));
          if (match) return path.join(baseDir, match);
        }
      } catch {}
    } else if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

export function getApps(): string {
  let output = '';

  for (const app of COMMON_APPS) {
    const foundPath = findAppPath(app);
    const status = foundPath ? chalk.green('✓') : chalk.gray('○');
    const pathStr = foundPath ? chalk.gray(` (${foundPath.replace(/\\/g, '/')})`) : '';

    output += `\n  ${status} ${chalk.white(app.name)}`;
    output += chalk.cyan(` ${app.launchCmd}`);
    output += chalk.gray(` - ${app.description}`);
    if (pathStr) output += pathStr;
  }

  output += chalk.bold('\n\n💡 Quick Launch Examples:\n');
  output += chalk.gray('  code .') + chalk.white('        - Open VS Code here\n');
  output += chalk.gray('  cursor .') + chalk.white('       - Open Cursor here\n');
  output += chalk.gray('  explorer .') + chalk.white('      - Open File Explorer here\n');
  output += chalk.gray('  wt') + chalk.white('             - Open Windows Terminal here\n');
  output += chalk.gray('  start chrome') + chalk.white('   - Open Chrome\n');

  return output;
}
