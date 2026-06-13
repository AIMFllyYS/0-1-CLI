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
  assert.doesNotMatch(installActions, /readline|question\(/);
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
