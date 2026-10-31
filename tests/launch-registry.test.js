const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function freshHome() {
  const home = mkdtempSync(join(tmpdir(), 'hi-launch-home-'));
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${join('dist', 'utils', 'config')}`) || key.includes(join('dist', 'modules', 'launch'))) {
      delete require.cache[key];
    }
  }
  return home;
}

function makeProject(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hi-launch-proj-'));
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return dir;
}

test('slugifyId derives a safe lowercase id from a folder name', () => {
  freshHome();
  const { slugifyId } = require('../dist/modules/launch/registry');
  assert.equal(slugifyId('DS'), 'ds');
  assert.equal(slugifyId('My Project_01'), 'my-project_01');
  assert.equal(slugifyId('  --weird//name--  '), 'weird-name');
  assert.equal(slugifyId('无人值守'), '');
});

test('isValidId only accepts lowercase slug ids', () => {
  freshHome();
  const { isValidId } = require('../dist/modules/launch/registry');
  assert.equal(isValidId('ds'), true);
  assert.equal(isValidId('a-b_c1'), true);
  assert.equal(isValidId(''), false);
  assert.equal(isValidId('Has Space'), false);
  assert.equal(isValidId('-lead'), false);
  assert.equal(isValidId('中文'), false);
});

test('classifyStart treats existing script files as script and everything else as command', () => {
  freshHome();
  const { classifyStart } = require('../dist/modules/launch/registry');
  const dir = makeProject({ 'start.cmd': '@echo hi', 'tools/run.ps1': 'echo hi', 'notes.txt': 'x' });

  assert.deepEqual(classifyStart('start.cmd', dir), { kind: 'script', value: 'start.cmd' });
  assert.deepEqual(classifyStart('tools/run.ps1', dir), { kind: 'script', value: 'tools/run.ps1' });
  assert.deepEqual(classifyStart(join(dir, 'start.cmd'), dir), { kind: 'script', value: 'start.cmd' });
  assert.deepEqual(classifyStart('python -m http.server 8848', dir), {
    kind: 'command',
    value: 'python -m http.server 8848',
  });
  assert.deepEqual(classifyStart('missing.cmd', dir), { kind: 'command', value: 'missing.cmd' });
  assert.deepEqual(classifyStart('notes.txt', dir), { kind: 'command', value: 'notes.txt' });
});

test('classifyStart keeps absolute script paths outside the project absolute', () => {
  freshHome();
  const { classifyStart } = require('../dist/modules/launch/registry');
  const dir = makeProject();
  const other = makeProject({ 'boot.bat': '@echo hi' });
  const result = classifyStart(join(other, 'boot.bat'), dir);
  assert.equal(result.kind, 'script');
  assert.equal(result.value, join(other, 'boot.bat').replace(/\\/g, '/'));
});

test('buildEntry normalizes path, derives id and name, applies defaults', () => {
  freshHome();
  const { buildEntry } = require('../dist/modules/launch/registry');
  const dir = makeProject({ 'start.cmd': '@echo hi' });

  const { entry, warnings } = buildEntry({ path: dir, start: 'start.cmd' }, []);
  assert.equal(entry.path, dir.replace(/\\/g, '/'));
  assert.match(entry.id, /^hi-launch-proj-/);
  assert.equal(entry.name, require('node:path').basename(dir));
  assert.deepEqual(entry.start, { kind: 'script', value: 'start.cmd' });
  assert.equal(entry.shell, 'cmd');
  assert.equal(entry.keepOpen, true);
  assert.deepEqual(warnings, []);
});

test('buildEntry works without a start command', () => {
  freshHome();
  const { buildEntry } = require('../dist/modules/launch/registry');
  const dir = makeProject();
  const { entry } = buildEntry({ path: dir, id: 'plain' }, []);
  assert.equal(entry.id, 'plain');
  assert.equal(entry.start, undefined);
});

test('buildEntry picks powershell for .ps1 scripts unless shell is given', () => {
  freshHome();
  const { buildEntry } = require('../dist/modules/launch/registry');
  const dir = makeProject({ 'up.ps1': 'echo hi' });
  assert.equal(buildEntry({ path: dir, id: 'a', start: 'up.ps1' }, []).entry.shell, 'powershell');
  assert.equal(buildEntry({ path: dir, id: 'b', start: 'up.ps1', shell: 'cmd' }, []).entry.shell, 'cmd');
});

test('buildEntry honors forced kind and warns when a forced script is missing', () => {
  freshHome();
  const { buildEntry } = require('../dist/modules/launch/registry');
  const dir = makeProject();
  const { entry, warnings } = buildEntry({ path: dir, id: 'x', start: 'nope.cmd', kind: 'script' }, []);
  assert.deepEqual(entry.start, { kind: 'script', value: 'nope.cmd' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /nope\.cmd/);
});

test('buildEntry rejects missing paths, files, bad ids, duplicate ids and bad shells', () => {
  freshHome();
  const { buildEntry } = require('../dist/modules/launch/registry');
  const dir = makeProject({ 'a.txt': 'x' });

  assert.throws(() => buildEntry({ path: join(dir, 'missing'), id: 'a' }, []), /不存在/);
  assert.throws(() => buildEntry({ path: join(dir, 'a.txt'), id: 'a' }, []), /不是目录/);
  assert.throws(() => buildEntry({ path: 'relative/dir', id: 'a' }, []), /绝对路径/);
  assert.throws(() => buildEntry({ path: dir, id: 'Bad Id' }, []), /id/);
  assert.throws(() => buildEntry({ path: dir, id: 'dup' }, [{ id: 'dup' }]), /已存在/);
  assert.throws(() => buildEntry({ path: dir, id: 'a', shell: 'zsh' }, []), /shell/);
});

test('buildEntry asks for an explicit id when the folder name cannot be slugified', () => {
  freshHome();
  const { buildEntry } = require('../dist/modules/launch/registry');
  const root = makeProject();
  const cn = join(root, '无人值守');
  mkdirSync(cn);
  assert.throws(() => buildEntry({ path: cn }, []), /--id/);
  const { entry } = buildEntry({ path: cn, id: 'wrz' }, []);
  assert.equal(entry.name, '无人值守');
  assert.equal(entry.path, cn.replace(/\\/g, '/'));
});

test('addLaunch persists to ~/.coding-cli.json and keeps existing keys', () => {
  const home = freshHome();
  writeFileSync(join(home, '.coding-cli.json'), JSON.stringify({ projectRoot: 'D:/projects' }), 'utf8');
  const { addLaunch, listLaunch } = require('../dist/modules/launch/registry');
  const dir = makeProject();

  addLaunch({ path: dir, id: 'one', start: 'npm run dev' });
  const saved = JSON.parse(readFileSync(join(home, '.coding-cli.json'), 'utf8'));
  assert.equal(saved.projectRoot, 'D:/projects');
  assert.equal(saved.launch.length, 1);
  assert.equal(saved.launch[0].id, 'one');
  assert.deepEqual(saved.launch[0].start, { kind: 'command', value: 'npm run dev' });
  assert.equal(listLaunch().length, 1);
});

test('removeLaunch deletes by id and reports unknown ids', () => {
  freshHome();
  const { addLaunch, removeLaunch, listLaunch } = require('../dist/modules/launch/registry');
  const dir = makeProject();
  addLaunch({ path: dir, id: 'one' });
  addLaunch({ path: dir, id: 'two' });

  assert.equal(removeLaunch('one').id, 'one');
  assert.deepEqual(listLaunch().map((e) => e.id), ['two']);
  assert.throws(() => removeLaunch('ghost'), /未找到/);
});

test('findLaunch returns the entry or undefined', () => {
  freshHome();
  const { addLaunch, findLaunch } = require('../dist/modules/launch/registry');
  const dir = makeProject();
  addLaunch({ path: dir, id: 'one' });
  assert.equal(findLaunch('one').id, 'one');
  assert.equal(findLaunch('nope'), undefined);
});

test('a corrupt config file is never overwritten by launch writes', () => {
  const home = freshHome();
  const file = join(home, '.coding-cli.json');
  const corrupt = '{ "projectRoot": "D:/projects", ';
  writeFileSync(file, corrupt, 'utf8');
  const { addLaunch, listLaunch } = require('../dist/modules/launch/registry');
  const dir = makeProject();

  assert.throws(() => addLaunch({ path: dir, id: 'one' }), /配置文件/);
  assert.throws(() => listLaunch(), /配置文件/);
  assert.equal(readFileSync(file, 'utf8'), corrupt);
});

test('saveConfig writes atomically without leaving temp files behind', () => {
  const home = freshHome();
  const { saveConfig } = require('../dist/utils/config');
  saveConfig({ projectRoot: 'D:/x' });
  assert.deepEqual(JSON.parse(readFileSync(join(home, '.coding-cli.json'), 'utf8')), { projectRoot: 'D:/x' });
  assert.equal(existsSync(join(home, '.coding-cli.json.tmp')), false);
});

test('formatLaunchList emits parseable JSON and a readable text table', () => {
  freshHome();
  const { formatLaunchList } = require('../dist/modules/launch/registry');
  const entries = [
    {
      id: 'ds',
      name: 'DS 工作区',
      path: 'D:/projects/DS',
      start: { kind: 'command', value: 'python -m http.server 8848' },
      shell: 'cmd',
      keepOpen: true,
    },
    { id: 'bare', name: 'bare', path: 'D:/projects/bare', shell: 'cmd', keepOpen: true },
  ];

  assert.deepEqual(JSON.parse(formatLaunchList(entries, { json: true })), entries);
  const text = formatLaunchList(entries, { json: false });
  assert.match(text, /ds/);
  assert.match(text, /python -m http\.server 8848/);
  assert.match(text, /DS 工作区/);
  assert.match(formatLaunchList([], { json: false }), /hi path add/);
  assert.equal(formatLaunchList([], { json: true }).trim(), '[]');
});

test('hi path subcommands run end to end against an isolated home', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-launch-e2e-'));
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  const dir = makeProject();
  const run = (...args) => execFileSync('node', ['dist/index.js', ...args], { encoding: 'utf8', env });

  run('path', 'add', dir, '--id', 'demo', '--start', 'python -m http.server 8848');
  const listed = JSON.parse(run('path', 'list', '--json'));
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0].start, { kind: 'command', value: 'python -m http.server 8848' });

  assert.match(run('path', 'show', 'demo'), /python -m http\.server 8848/);
  run('path', 'rm', 'demo');
  assert.deepEqual(JSON.parse(run('path', 'list', '--json')), []);

  assert.throws(() => run('path', 'rm', 'demo'), (error) => error.status === 1);
});

test('existing root flags still work next to the path subcommand', () => {
  const out = execFileSync('node', ['dist/index.js', '--version'], { encoding: 'utf8' }).trim();
  assert.match(out, /^\d+\.\d+\.\d+$/);
  const help = execFileSync('node', ['dist/index.js', '--help'], { encoding: 'utf8' });
  assert.match(help, /hi path/);
});
