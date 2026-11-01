const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(...file.split('/')), 'utf8');
}

function readRenderer() {
  return [
    'desktop/src/renderer/App.tsx',
    'desktop/src/renderer/codex-shell/CodexShell.tsx',
    'desktop/src/renderer/codex-shell/useConversationState.ts',
    'desktop/src/renderer/codex-shell/ConversationView.tsx',
    'desktop/src/renderer/codex-shell/Composer.tsx',
  ].map(read).join('\n');
}

test('desktop install IPC lists grouped targets and requires explicit confirmation before install', () => {
  const main = read('desktop/src/main/tools-ipc.ts');
  const trust = read('desktop/src/main/main.ts') + main;
  const installActions = read('desktop/src/main/install-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-install:list/);
  assert.match(main, /desktop-install:run/);
  assert.match(trust, /isTrustedSender/);
  assert.match(preload, /desktop-install:list/);
  assert.match(preload, /desktop-install:run/);
  assert.match(installActions, /category: 'cli'/);
  assert.match(installActions, /category: 'ide'/);
  assert.match(installActions, /category: 'environment'/);
  assert.match(installActions, /requiresConfirmation: true/);
  assert.match(installActions, /confirm !== true/);
  assert.match(installActions, /runDesktopInstallCommand/);
  assert.doesNotMatch(installActions, /readline|question\(/);
  assert.doesNotMatch(installActions, /runDesktopCli\(`install/);
});

test('desktop skills IPC lists marketplace and requires explicit target confirmation', () => {
  const main = read('desktop/src/main/tools-ipc.ts');
  const skillsActions = read('desktop/src/main/skills-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-skills:list/);
  assert.match(main, /desktop-skills:install/);
  assert.match(preload, /desktop-skills:list/);
  assert.match(preload, /desktop-skills:install/);
  assert.match(skillsActions, /DESKTOP_SKILL_PACKAGES/);
  assert.match(skillsActions, /getDesktopSkillTargets/);
  assert.match(skillsActions, /confirm !== true/);
  assert.match(skillsActions, /installDesktopSkillPackage/);
  assert.doesNotMatch(skillsActions, /readline|question\(/);
});

test('desktop clear IPC scans first and requires explicit confirmation before killing processes', () => {
  const main = read('desktop/src/main/tools-ipc.ts');
  const clearActions = read('desktop/src/main/clear-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-clear:scan/);
  assert.match(main, /desktop-clear:kill/);
  assert.match(preload, /desktop-clear:scan/);
  assert.match(preload, /desktop-clear:kill/);
  assert.match(clearActions, /scanDesktopClearProcesses/);
  assert.match(clearActions, /killDesktopClearProcesses/);
  assert.match(clearActions, /confirm !== true/);
  assert.match(clearActions, /taskkill/);
  assert.doesNotMatch(clearActions, /readline|question\(|Remove-Item|Clear-RecycleBin/);
});

test('desktop permissions deny interactive and arbitrary cli commands', () => {
  const permissions = read('desktop/src/main/permissions.ts');
  const runner = read('desktop/src/main/cli-runner.ts');
  const allowedBlock = permissions.match(/ALLOWED_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
  const interactiveBlock = permissions.match(/INTERACTIVE_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';

  assert.match(permissions, /validateDesktopCommand/);
  assert.match(permissions, /INTERACTIVE_COMMANDS/);
  assert.match(permissions, /ALLOWED_COMMANDS/);
  assert.match(runner, /validateDesktopCommand/);
  assert.match(interactiveBlock, /'clear'/);
  assert.match(interactiveBlock, /'skills'/);
  assert.match(interactiveBlock, /'install'/);
  assert.match(interactiveBlock, /'ai'/);
  assert.doesNotMatch(allowedBlock, /'clear'/);
  assert.doesNotMatch(allowedBlock, /'skills'/);
  assert.doesNotMatch(allowedBlock, /'install'/);
  assert.doesNotMatch(allowedBlock, /'ai'/);
});

test('desktop cli runner times out long running commands', () => {
  const runner = read('desktop/src/main/cli-runner.ts');

  assert.match(runner, /CLI_TIMEOUT_MS/);
  assert.match(runner, /\.kill\(/);
  assert.match(runner, /timed out/i);
});

test('desktop preload only forwards whitelisted channels and the cli runner re-validates commands', () => {
  const preload = read('desktop/src/preload/index.ts');
  const permissions = read('desktop/src/main/permissions.ts');
  const runner = read('desktop/src/main/cli-runner.ts');

  assert.match(preload, /REQUEST_CHANNELS\.has\(channel\)/);
  assert.match(preload, /unknown_channel/);
  assert.match(permissions, /export function validateDesktopCommand/);
  assert.match(runner, /validateDesktopCommand\(command\)/);
});

test('desktop ai runs in-process through dedicated channels and never through a shell', () => {
  const api = read('src/desktop/api.ts');
  const preload = read('desktop/src/preload/index.ts');
  const runner = read('desktop/src/main/cli-runner.ts');

  for (const channel of ['ai:createSession', 'ai:send', 'ai:approve', 'ai:abort']) {
    assert.match(api, new RegExp("'" + channel + "'"));
    assert.match(preload, new RegExp("'" + channel + "'"));
  }
  assert.doesNotMatch(runner, /launchDesktopAiSession/);
  assert.doesNotMatch(api, /shell:\s*true|child_process/);
});

test('desktop vite build uses file-safe relative renderer assets', () => {
  const viteConfig = read('desktop/vite.config.ts');

  assert.match(viteConfig, /base:\s*['"]\.\/['"]/);
  assert.match(viteConfig, /emptyOutDir:\s*true/);
});

