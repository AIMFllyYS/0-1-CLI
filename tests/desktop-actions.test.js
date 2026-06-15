const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(...file.split('/')), 'utf8');
}

test('desktop action catalog exposes native install skills clear and utility actions', () => {
  const catalog = read('desktop/src/renderer/action-catalog.ts');

  assert.match(catalog, /id: 'install'/);
  assert.match(catalog, /kind: 'native-install'/);
  assert.match(catalog, /id: 'skills'/);
  assert.match(catalog, /kind: 'native-skills'/);
  assert.match(catalog, /id: 'clear'/);
  assert.match(catalog, /kind: 'native-clear'/);
  assert.match(catalog, /id: 'state'/);
  assert.match(catalog, /id: 'api'/);
  assert.match(catalog, /id: 'pay'/);
});

test('desktop install IPC lists grouped targets and requires explicit confirmation before install', () => {
  const main = read('desktop/src/main/main.ts');
  const installActions = read('desktop/src/main/install-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-install:list/);
  assert.match(main, /desktop-install:run/);
  assert.match(main, /isTrustedSender/);
  assert.match(preload, /listInstallTargets/);
  assert.match(preload, /runInstallTarget/);
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
  const main = read('desktop/src/main/main.ts');
  const skillsActions = read('desktop/src/main/skills-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-skills:list/);
  assert.match(main, /desktop-skills:install/);
  assert.match(preload, /listSkillPackages/);
  assert.match(preload, /installSkillPackage/);
  assert.match(skillsActions, /DESKTOP_SKILL_PACKAGES/);
  assert.match(skillsActions, /getDesktopSkillTargets/);
  assert.match(skillsActions, /confirm !== true/);
  assert.match(skillsActions, /installDesktopSkillPackage/);
  assert.doesNotMatch(skillsActions, /readline|question\(/);
});

test('desktop clear IPC scans first and requires explicit confirmation before killing processes', () => {
  const main = read('desktop/src/main/main.ts');
  const clearActions = read('desktop/src/main/clear-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-clear:scan/);
  assert.match(main, /desktop-clear:kill/);
  assert.match(preload, /scanClearProcesses/);
  assert.match(preload, /killClearProcesses/);
  assert.match(clearActions, /scanDesktopClearProcesses/);
  assert.match(clearActions, /killDesktopClearProcesses/);
  assert.match(clearActions, /confirm !== true/);
  assert.match(clearActions, /taskkill/);
  assert.doesNotMatch(clearActions, /readline|question\(|Remove-Item|Clear-RecycleBin/);
});

test('desktop renderer opens native install panel instead of running interactive install command', () => {
  const renderer = read('desktop/src/renderer/App.tsx');

  assert.match(renderer, /activeAction === 'install'/);
  assert.match(renderer, /listInstallTargets/);
  assert.match(renderer, /runInstallTarget/);
  assert.match(renderer, /InstallPanel/);
  assert.doesNotMatch(renderer, /runCommand\('hi --install'\)/);
});

test('desktop renderer opens native skills panel instead of running interactive skills command', () => {
  const renderer = read('desktop/src/renderer/App.tsx');

  assert.match(renderer, /activeAction === 'skills'/);
  assert.match(renderer, /listSkillPackages/);
  assert.match(renderer, /installSkillPackage/);
  assert.match(renderer, /SkillsPanel/);
  assert.doesNotMatch(renderer, /runCommand\('hi --skills'\)/);
});

test('desktop renderer opens native clear panel instead of running interactive clear command', () => {
  const renderer = read('desktop/src/renderer/App.tsx');

  assert.match(renderer, /activeAction === 'clear'/);
  assert.match(renderer, /scanClearProcesses/);
  assert.match(renderer, /killClearProcesses/);
  assert.match(renderer, /ClearPanel/);
  assert.doesNotMatch(renderer, /runCommand\('hi --clear'\)/);
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

test('desktop renderer exposes copyable command output and busy guard', () => {
  const renderer = read('desktop/src/renderer/App.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  assert.match(renderer, /copyOutput/);
  assert.match(renderer, /Copy output/);
  assert.match(renderer, /commandBusy/);
  assert.match(renderer, /outputPanel/);
  assert.match(styles, /user-select:\s*text/);
  assert.match(styles, /\.outputPanel/);
  assert.match(styles, /\.outputHeader/);
});

test('desktop preload rejects non-whitelisted runCommand requests', () => {
  const preload = read('desktop/src/preload/index.ts');
  const permissions = read('desktop/src/main/permissions.ts');

  assert.match(preload, /validateDesktopCommand/);
  assert.match(permissions, /export function validateDesktopCommand/);
});

test('desktop ai bridge uses dedicated ipc and does not expose raw shell', () => {
  const main = read('desktop/src/main/main.ts');
  const runner = read('desktop/src/main/cli-runner.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /ai:launch/);
  assert.match(runner, /launchDesktopAiSession/);
  assert.match(preload, /launchAiSession/);
  assert.match(runner, /--ai/);
  assert.doesNotMatch(runner, /launchDesktopAiSession[\s\S]*shell:\s*true/);
  assert.doesNotMatch(preload, /runCommand\([^)]*['"]ai['"]/);
});

test('desktop renderer separates ai bridge from dashboard commands', () => {
  const renderer = read('desktop/src/renderer/App.tsx');

  assert.match(renderer, /launchAiSession/);
  assert.doesNotMatch(renderer, /runCommand\(['"]hi --ai['"]\)/);
  assert.doesNotMatch(renderer, /runCommand\(['"]ai['"]\)/);
  assert.match(renderer, /outputPanel/);
});

test('desktop renderer mirrors cli modes and balanced shell layout', () => {
  const renderer = read('desktop/src/renderer/App.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  assert.match(renderer, /read-only/);
  assert.match(renderer, /asks before tools/);
  assert.match(renderer, /no edits/);
  assert.match(renderer, /modeSwitch/);
  assert.match(styles, /\.shell\s*\{/);
  assert.match(styles, /\.sidebar\s*\{/);
  assert.match(styles, /\.conversation\s*\{/);
  assert.match(styles, /\.inspector\s*\{/);
  assert.match(styles, /\.composer\s*\{/);
});

test('desktop settings panel explains cli setting flow', () => {
  const renderer = read('desktop/src/renderer/App.tsx');

  assert.match(renderer, /\/setting/);
  assert.match(renderer, /SettingsPanel/);
  assert.match(renderer, /launchAiSession|Open AI terminal/i);
});
