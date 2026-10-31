const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const terminal = require('../dist/modules/launch/terminal');

function entry(overrides = {}) {
  return {
    id: 'ds',
    name: 'DS 工作区',
    path: 'D:/projects/DS',
    shell: 'cmd',
    keepOpen: true,
    ...overrides,
  };
}

function fakeSpawn(behaviors) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    const behavior = behaviors[calls.length - 1] ?? 'ok';
    process.nextTick(() => {
      if (behavior === 'ok') child.emit('spawn');
      else child.emit('error', Object.assign(new Error(`spawn ${command} ${behavior}`), { code: behavior }));
    });
    return child;
  };
  return { spawn, calls };
}

function realDir(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hi-term-'));
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return dir;
}

test('wt plan runs a cmd command in the project directory and keeps the window open', () => {
  const plan = terminal.planWindowsTerminal(
    entry({ start: { kind: 'command', value: 'python -m http.server 8848' } }),
  );
  assert.equal(plan.terminal, 'wt');
  assert.equal(plan.command, 'wt.exe');
  assert.deepEqual(plan.args, [
    '-d', 'D:/projects/DS',
    '--title', 'DS 工作区',
    'cmd', '/k', 'python -m http.server 8848',
  ]);
});

test('wt plan escapes semicolons in every argument', () => {
  const plan = terminal.planWindowsTerminal(
    entry({
      name: 'a;b',
      path: 'D:/x;y',
      start: { kind: 'command', value: 'echo one;two' },
    }),
  );
  assert.deepEqual(plan.args, ['-d', 'D:/x\\;y', '--title', 'a\\;b', 'cmd', '/k', 'echo one\\;two']);
});

test('keepOpen=false uses /c for cmd and drops -NoExit for powershell', () => {
  const cmdPlan = terminal.planWindowsTerminal(
    entry({ keepOpen: false, start: { kind: 'command', value: 'npm test' } }),
  );
  assert.deepEqual(cmdPlan.args.slice(-3), ['cmd', '/c', 'npm test']);

  const psPlan = terminal.planWindowsTerminal(
    entry({ shell: 'powershell', keepOpen: false, start: { kind: 'command', value: 'npm test' } }),
  );
  assert.deepEqual(psPlan.args.slice(4), ['powershell', '-NoLogo', '-Command', 'npm test']);
});

test('powershell plan keeps the window open with -NoExit', () => {
  const plan = terminal.planWindowsTerminal(
    entry({ shell: 'powershell', start: { kind: 'command', value: 'npm run dev' } }),
  );
  assert.deepEqual(plan.args.slice(4), ['powershell', '-NoLogo', '-NoExit', '-Command', 'npm run dev']);
});

test('entries without start just open an interactive shell in the directory', () => {
  assert.deepEqual(terminal.planWindowsTerminal(entry()).args.slice(4), ['cmd', '/k']);
  assert.deepEqual(
    terminal.planWindowsTerminal(entry({ shell: 'powershell' })).args.slice(4),
    ['powershell', '-NoLogo', '-NoExit'],
  );
});

test('cmd scripts are resolved against the project directory and quoted', () => {
  const plan = terminal.planWindowsTerminal(
    entry({ start: { kind: 'script', value: 'tools/start up.cmd' } }),
  );
  const expected = `"${resolve('D:/projects/DS', 'tools/start up.cmd')}"`;
  assert.deepEqual(plan.args.slice(4), ['cmd', '/k', expected]);

  const absolute = terminal.planWindowsTerminal(
    entry({ start: { kind: 'script', value: 'E:/boot/run.bat' } }),
  );
  assert.equal(absolute.args[absolute.args.length - 1], `"${resolve('E:/boot/run.bat')}"`);
});

test('powershell scripts are invoked with the call operator and single quotes doubled', () => {
  const plan = terminal.planWindowsTerminal(
    entry({ shell: 'powershell', start: { kind: 'script', value: "it's up.ps1" } }),
  );
  const expected = `& '${resolve('D:/projects/DS', "it's up.ps1").replace(/'/g, "''")}'`;
  assert.equal(plan.args[plan.args.length - 1], expected);
});

test('a .ps1 script under the cmd shell is run through powershell -File', () => {
  const plan = terminal.planWindowsTerminal(
    entry({ shell: 'cmd', start: { kind: 'script', value: 'up.ps1' } }),
  );
  const line = plan.args[plan.args.length - 1];
  assert.equal(line, `powershell -NoLogo -File "${resolve('D:/projects/DS', 'up.ps1')}"`);
});

test('cmd fallback plan uses cmd.exe with cwd, verbatim quoting and a detached console', () => {
  const plan = terminal.planCmdFallback(
    entry({ start: { kind: 'command', value: 'echo "a b" && echo done' } }),
  );
  assert.equal(plan.terminal, 'cmd');
  assert.equal(plan.command, 'cmd.exe');
  assert.deepEqual(plan.args, ['/d', '/s', '/k', '"echo "a b" && echo done"']);
  assert.equal(plan.options.cwd, resolve('D:/projects/DS'));
  assert.equal(plan.options.windowsVerbatimArguments, true);
  assert.equal(plan.options.detached, true);
});

test('cmd fallback does not escape semicolons', () => {
  const plan = terminal.planCmdFallback(entry({ start: { kind: 'command', value: 'echo one;two' } }));
  assert.equal(plan.args[3], '"echo one;two"');
});

test('cmd fallback for powershell entries starts powershell.exe in the directory', () => {
  const plan = terminal.planCmdFallback(
    entry({ shell: 'powershell', start: { kind: 'command', value: 'npm run dev' } }),
  );
  assert.equal(plan.command, 'powershell.exe');
  assert.deepEqual(plan.args, ['-NoLogo', '-NoExit', '-Command', 'npm run dev']);
  assert.equal(plan.options.cwd, resolve('D:/projects/DS'));
});

test('launchEntry prefers wt and reports it', async () => {
  const dir = realDir();
  const { spawn, calls } = fakeSpawn(['ok']);
  const result = await terminal.launchEntry(entry({ path: dir }), { spawn, platform: 'win32' });

  assert.equal(result.terminal, 'wt');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'wt.exe');
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, 'ignore');
});

test('launchEntry falls back to cmd when wt is missing', async () => {
  const dir = realDir();
  const { spawn, calls } = fakeSpawn(['ENOENT', 'ok']);
  const result = await terminal.launchEntry(
    entry({ path: dir, start: { kind: 'command', value: 'npm run dev' } }),
    { spawn, platform: 'win32' },
  );

  assert.equal(result.terminal, 'cmd');
  assert.deepEqual(calls.map((call) => call.command), ['wt.exe', 'cmd.exe']);
  assert.equal(calls[1].options.cwd, resolve(dir));
});

test('launchEntry also falls back when wt is not executable', async () => {
  const dir = realDir();
  const { spawn, calls } = fakeSpawn(['EACCES', 'ok']);
  const result = await terminal.launchEntry(entry({ path: dir }), { spawn, platform: 'win32' });
  assert.equal(result.terminal, 'cmd');
  assert.equal(calls.length, 2);
});

test('launchEntry rejects when both terminals fail to start', async () => {
  const dir = realDir();
  const { spawn } = fakeSpawn(['ENOENT', 'ENOENT']);
  await assert.rejects(
    terminal.launchEntry(entry({ path: dir }), { spawn, platform: 'win32' }),
    /无法启动终端/,
  );
});

test('launchEntry rejects a missing project directory without spawning', async () => {
  const { spawn, calls } = fakeSpawn([]);
  await assert.rejects(
    terminal.launchEntry(entry({ path: join(tmpdir(), 'hi-definitely-missing-dir') }), { spawn, platform: 'win32' }),
    /项目目录不存在/,
  );
  assert.equal(calls.length, 0);
});

test('launchEntry rejects a missing script file without spawning', async () => {
  const dir = realDir();
  const { spawn, calls } = fakeSpawn([]);
  await assert.rejects(
    terminal.launchEntry(entry({ path: dir, start: { kind: 'script', value: 'gone.cmd' } }), {
      spawn,
      platform: 'win32',
    }),
    /脚本不存在/,
  );
  assert.equal(calls.length, 0);
});

test('launchEntry accepts an existing script inside a Chinese, spaced directory', async () => {
  const dir = realDir({ '无人值守 dir/start up.cmd': '@echo off' });
  const { spawn, calls } = fakeSpawn(['ok']);
  await terminal.launchEntry(
    entry({ path: join(dir, '无人值守 dir'), start: { kind: 'script', value: 'start up.cmd' } }),
    { spawn, platform: 'win32' },
  );
  assert.equal(calls.length, 1);
});

test('launchEntry refuses non-Windows platforms with a clear message', async () => {
  const dir = realDir();
  const { spawn, calls } = fakeSpawn([]);
  await assert.rejects(terminal.launchEntry(entry({ path: dir }), { spawn, platform: 'linux' }), /仅支持 Windows/);
  assert.equal(calls.length, 0);
});

function hi(env, ...args) {
  return execFileSync('node', ['dist/index.js', ...args], { encoding: 'utf8', env, stdio: 'pipe' });
}

test('hi run --dry-run prints the wt plan without opening a window', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-run-e2e-'));
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  const dir = realDir();
  hi(env, 'path', 'add', dir, '--id', 'demo', '--start', 'echo one;two');

  const plan = JSON.parse(hi(env, 'run', 'demo', '--dry-run'));
  assert.equal(plan.terminal, 'wt');
  assert.equal(plan.command, 'wt.exe');
  assert.equal(plan.args[plan.args.length - 1], 'echo one\\;two');
});

test('hi run with an unknown id fails and lists the available ids', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-run-e2e-'));
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  hi(env, 'path', 'add', realDir(), '--id', 'demo');

  assert.throws(
    () => hi(env, 'run', 'ghost'),
    (error) => error.status === 1 && /未找到 id：ghost/.test(error.stderr) && /demo/.test(error.stderr),
  );
});

test('hi run without an id on an empty registry points to hi path add', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-run-e2e-'));
  const env = { ...process.env, USERPROFILE: home, HOME: home };

  assert.throws(
    () => hi(env, 'run'),
    (error) => error.status === 1 && /hi path add/.test(error.stderr),
  );
});

test('hi --help mentions hi run', () => {
  const help = execFileSync('node', ['dist/index.js', '--help'], { encoding: 'utf8' });
  assert.match(help, /hi run/);
});
