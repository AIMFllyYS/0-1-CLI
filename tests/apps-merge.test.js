const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function freshHome() {
  const home = mkdtempSync(join(tmpdir(), 'hi-apps-home-'));
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  for (const key of Object.keys(require.cache)) {
    if (key.includes(join('dist', 'utils', 'config')) || key.includes(join('dist', 'modules'))) {
      delete require.cache[key];
    }
  }
  return home;
}

function fakeFs(files, dirs = {}) {
  const normalize = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const fileSet = new Set(files.map(normalize));
  const dirMap = new Map(Object.entries(dirs).map(([key, names]) => [normalize(key), names]));
  return {
    exists: (target) => fileSet.has(normalize(target)),
    readdir: (target) => dirMap.get(normalize(target)) ?? [],
  };
}

test('resolveOnPath finds an executable through PATHEXT, quoted entries and a mixed-case Path key', () => {
  freshHome();
  const { resolveOnPath } = require('../dist/modules/apps');
  const fs = fakeFs(['C:/tools/claude.cmd', 'D:/bin dir/code.exe']);
  const env = { Path: 'C:\\missing;"D:\\bin dir";C:\\tools', PATHEXT: '.EXE;.CMD' };

  assert.equal(resolveOnPath('claude', env, fs.exists), 'C:/tools/claude.cmd');
  assert.equal(resolveOnPath('code', env, fs.exists), 'D:/bin dir/code.exe');
  assert.equal(resolveOnPath('nothere', env, fs.exists), null);
});

test('resolveOnPath uses default extensions and ignores empty PATH', () => {
  freshHome();
  const { resolveOnPath } = require('../dist/modules/apps');
  const fs = fakeFs(['C:/bin/node.exe']);

  assert.equal(resolveOnPath('node', { PATH: 'C:\\bin' }, fs.exists), 'C:/bin/node.exe');
  assert.equal(resolveOnPath('node', {}, fs.exists), null);
});

test('expandCandidates substitutes environment variables case-insensitively and drops unknown ones', () => {
  freshHome();
  const { expandCandidates } = require('../dist/modules/apps');
  const fs = fakeFs([]);
  const env = { LocalAppData: 'C:\\Users\\Someone\\AppData\\Local' };

  assert.deepEqual(
    expandCandidates('%LOCALAPPDATA%/Programs/App/app.exe', env, fs.readdir),
    ['C:/Users/Someone/AppData/Local/Programs/App/app.exe'],
  );
  assert.deepEqual(expandCandidates('%NOPE%/app.exe', env, fs.readdir), []);
});

test('expandCandidates expands a wildcard segment, newest version first', () => {
  freshHome();
  const { expandCandidates } = require('../dist/modules/apps');
  const fs = fakeFs([], { 'C:/': ['Python39', 'Python312', 'Python314', 'Other'] });

  assert.deepEqual(expandCandidates('C:/Python*/python.exe', {}, fs.readdir), [
    'C:/Python314/python.exe',
    'C:/Python312/python.exe',
    'C:/Python39/python.exe',
  ]);
});

test('detectApps prefers the PATH hit, falls back to known install paths, and reports missing apps', () => {
  freshHome();
  const { detectApps } = require('../dist/modules/apps');
  const fs = fakeFs([
    'C:/bin/code.cmd',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Windows/notepad.exe',
  ]);
  const env = {
    PATH: 'C:\\bin',
    PATHEXT: '.CMD;.EXE',
    ProgramFiles: 'C:\\Program Files',
    SystemRoot: 'C:\\Windows',
  };
  const found = Object.fromEntries(
    detectApps({ env, exists: fs.exists, readdir: fs.readdir }).map((item) => [item.app.name, item.foundPath]),
  );

  assert.equal(found['VS Code'], 'C:/bin/code.cmd');
  assert.equal(found['Chrome'], 'C:/Program Files/Google/Chrome/Application/chrome.exe');
  assert.equal(found['Notepad'], 'C:/Windows/notepad.exe');
  assert.equal(found['Kiro'], null);
});

test('the app catalog no longer hardcodes a specific user profile', () => {
  freshHome();
  const { APP_CATALOG } = require('../dist/modules/apps');
  assert.ok(APP_CATALOG.length >= 10);
  assert.equal(/Users\/|Users\\|Lenovo/i.test(JSON.stringify(APP_CATALOG)), false);
});

test('pathExists sees real files, missing paths and treats dangling links as present', () => {
  freshHome();
  const { pathExists } = require('../dist/modules/apps');
  const dir = mkdtempSync(join(tmpdir(), 'hi-apps-exists-'));
  const file = join(dir, 'a.exe');
  writeFileSync(file, 'x');

  assert.equal(pathExists(file), true);
  assert.equal(pathExists(join(dir, 'missing.exe')), false);
});

function registerOne(id, extra = {}) {
  const { addLaunch } = require('../dist/modules/launch/registry');
  const dir = mkdtempSync(join(tmpdir(), 'hi-apps-proj-'));
  addLaunch({ path: dir, id, start: 'python -m http.server 8848', ...extra });
  return dir;
}

test('getApps lists registered paths next to the built-in apps with their hi run command', () => {
  freshHome();
  registerOne('dsws');
  const { getApps } = require('../dist/modules/apps');
  const output = getApps();

  assert.match(output, /App Launch Commands/);
  assert.match(output, /VS Code/);
  assert.match(output, /dsws/);
  assert.match(output, /hi run dsws/);
});

test('getApps points to hi path add when nothing is registered', () => {
  freshHome();
  const { getApps } = require('../dist/modules/apps');
  assert.match(getApps(), /hi path add/);
});

test('getApps marks a registered path whose directory disappeared', () => {
  freshHome();
  const { rmSync } = require('node:fs');
  const dir = registerOne('gone');
  rmSync(dir, { recursive: true, force: true });
  const { getApps } = require('../dist/modules/apps');

  assert.match(getApps(), /✗/);
});

test('getApps survives an unreadable registry and says so', () => {
  const home = freshHome();
  writeFileSync(join(home, '.coding-cli.json'), '{ "launch": [', 'utf8');
  const { getApps } = require('../dist/modules/apps');

  let output = '';
  assert.doesNotThrow(() => {
    output = getApps();
  });
  assert.match(output, /VS Code/);
  assert.match(output, /配置文件/);
});

test('hi --apps shows built-in and registered entries end to end', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-apps-e2e-'));
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  const dir = mkdtempSync(join(tmpdir(), 'hi-apps-e2e-proj-'));
  mkdirSync(dir, { recursive: true });
  execFileSync(process.execPath, ['dist/index.js', 'path', 'add', dir, '--id', 'e2e'], { env });

  const result = spawnSync(process.execPath, ['dist/index.js', '--apps'], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Windows Terminal/);
  assert.match(result.stdout, /hi run e2e/);
});
