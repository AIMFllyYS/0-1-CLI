const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { PassThrough } = require('node:stream');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, basename } = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const { probeStart } = require('../dist/modules/launch/probe');
const interactive = require('../dist/modules/launch/interactive');

function project(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hi-int-proj-'));
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return dir;
}

function scripted(answers) {
  const prompts = [];
  const queue = [...answers];
  return {
    prompts,
    ask: async (question) => {
      prompts.push(question);
      if (queue.length === 0) throw new interactive.PromptCancelled();
      return queue.shift();
    },
    close() {},
  };
}

function collect(seed, answers, extra = {}) {
  const prompter = scripted(answers);
  const logs = [];
  const promise = interactive.collectAddInput(seed, {
    prompter,
    existingIds: extra.existingIds ?? [],
    cwd: extra.cwd ?? process.cwd(),
    log: (message) => logs.push(message),
  });
  return { promise, prompter, logs };
}

test('probe prefers an explicit start script', () => {
  const dir = project({ 'run.ps1': 'x', 'start.cmd': 'x', 'package.json': '{"scripts":{"dev":"vite"}}' });
  const found = probeStart(dir);
  assert.equal(found.kind, 'script');
  assert.equal(found.value, 'start.cmd');
  assert.match(found.reason, /start\.cmd/);
});

test('probe finds run.ps1 when it is the only script', () => {
  assert.equal(probeStart(project({ 'run.ps1': 'x' })).value, 'run.ps1');
});

test('probe suggests npm run dev when package.json has a dev script', () => {
  const found = probeStart(project({ 'package.json': '{"scripts":{"dev":"vite","build":"vite build"}}' }));
  assert.deepEqual({ kind: found.kind, value: found.value }, { kind: 'command', value: 'npm run dev' });
});

test('probe reads package.json with a UTF-8 BOM', () => {
  const found = probeStart(project({ 'package.json': '\uFEFF{"scripts":{"dev":"vite"}}' }));
  assert.equal(found.value, 'npm run dev');
});

test('probe stays silent for package.json without dev, even with index.html', () => {
  assert.equal(probeStart(project({ 'package.json': '{"scripts":{"build":"x"}}', 'index.html': '<p>' })), undefined);
});

test('probe does not throw on a broken package.json', () => {
  assert.equal(probeStart(project({ 'package.json': '{ nope', 'index.html': '<p>' })), undefined);
});

test('probe suggests a static server for index.html without package.json', () => {
  const found = probeStart(project({ 'index.html': '<p>' }));
  assert.deepEqual({ kind: found.kind, value: found.value }, { kind: 'command', value: 'python -m http.server 8848' });
});

test('probe returns undefined for an empty or missing directory', () => {
  assert.equal(probeStart(project()), undefined);
  assert.equal(probeStart(join(tmpdir(), 'hi-int-definitely-missing')), undefined);
});

test('normalizePathInput strips quotes, trims and resolves against cwd', () => {
  const cwd = project();
  assert.equal(interactive.normalizePathInput(`  "${cwd}"  `, 'C:\\other'), resolve(cwd));
  assert.equal(interactive.normalizePathInput("'sub dir'", cwd), resolve(cwd, 'sub dir'));
  assert.equal(interactive.normalizePathInput('.', cwd), resolve(cwd));
});

test('collectAddInput accepts every default with Enter and shows the detection hint', async () => {
  const dir = project({ 'index.html': '<p>' });
  const { promise, prompter, logs } = collect({ path: dir }, ['', '', '']);
  const input = await promise;

  assert.equal(input.path, resolve(dir));
  assert.equal(input.start, 'python -m http.server 8848');
  assert.equal(input.id, basename(dir).toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, ''));
  assert.equal(input.name, undefined);
  assert.equal(prompter.prompts.length, 3);
  assert.match(prompter.prompts[0], /python -m http\.server 8848/);
  assert.ok(logs.some((line) => /index\.html/.test(line)));
});

test('collectAddInput lets a dash clear the suggested start', async () => {
  const dir = project({ 'index.html': '<p>' });
  const input = await collect({ path: dir }, ['-', 'keep', '']).promise;
  assert.equal(input.start, undefined);
  assert.equal(input.id, 'keep');
});

test('collectAddInput lets the user override the suggestion and set a name', async () => {
  const dir = project({ 'package.json': '{"scripts":{"dev":"vite"}}' });
  const input = await collect({ path: dir }, ['pnpm dev', 'web', 'Web 前端']).promise;
  assert.equal(input.start, 'pnpm dev');
  assert.equal(input.id, 'web');
  assert.equal(input.name, 'Web 前端');
});

test('collectAddInput with no suggestion treats Enter as no start', async () => {
  const input = await collect({ path: project() }, ['', 'plain', '']).promise;
  assert.equal(input.start, undefined);
});

test('collectAddInput re-asks for an invalid or duplicate id', async () => {
  const dir = project();
  const { promise, prompter, logs } = collect({ path: dir }, ['', 'Bad Id', 'taken', 'fresh', ''], {
    existingIds: ['taken'],
  });
  const input = await promise;
  assert.equal(input.id, 'fresh');
  assert.equal(prompter.prompts.length, 5);
  assert.ok(logs.some((line) => /id/.test(line) && /小写/.test(line)));
  assert.ok(logs.some((line) => /已存在/.test(line)));
});

test('collectAddInput requires an explicit id when the folder name cannot be slugified', async () => {
  const root = project();
  const cn = join(root, '无人值守');
  mkdirSync(cn);
  const { promise, prompter } = collect({ path: cn }, ['', '', 'wrz', '']);
  const input = await promise;
  assert.equal(input.id, 'wrz');
  assert.equal(prompter.prompts.length, 4);
});

test('collectAddInput asks for the path first, defaulting to cwd and re-asking on bad input', async () => {
  const cwd = project({ 'index.html': '<p>' });
  const target = project();
  const { promise, prompter, logs } = collect({}, ['', 'no/such/dir', `"${target}"`, '-', 'x', ''], { cwd });
  // first answer '' -> cwd is valid, so only one path prompt is used
  const first = await promise;
  assert.equal(first.path, resolve(cwd));
  assert.ok(prompter.prompts[0].includes(cwd));

  const second = collect({}, ['no/such/dir', `"${target}"`, '-', 'y', ''], { cwd });
  const result = await second.promise;
  assert.equal(result.path, resolve(target));
  assert.ok(second.logs.some((line) => /路径不存在/.test(line)));
  assert.equal(logs.length >= 0, true);
});

test('collectAddInput skips prompts for values already supplied', async () => {
  const dir = project();
  const { promise, prompter } = collect({ path: dir, start: 'echo hi', id: 'a', name: 'A', shell: 'powershell', keepOpen: false }, []);
  const input = await promise;
  assert.equal(prompter.prompts.length, 0);
  assert.equal(input.start, 'echo hi');
  assert.equal(input.shell, 'powershell');
  assert.equal(input.keepOpen, false);
});

test('collectAddInput rejects an invalid supplied path before asking anything', async () => {
  const { promise, prompter } = collect({ path: join(tmpdir(), 'hi-int-definitely-missing') }, []);
  await assert.rejects(promise, /路径不存在/);
  assert.equal(prompter.prompts.length, 0);
});

test('collectAddInput propagates cancellation', async () => {
  const dir = project();
  await assert.rejects(collect({ path: dir }, ['']).promise, interactive.PromptCancelled);
});

test('createPrompter keeps lines that arrive before the next question', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const prompter = interactive.createPrompter(input, output);
  input.write('first\nsecond\n三\n');
  assert.equal(await prompter.ask('a: '), 'first');
  assert.equal(await prompter.ask('b: '), 'second');
  assert.equal(await prompter.ask('c: '), '三');
  prompter.close();
});

test('createPrompter rejects pending and later questions once input ends', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const prompter = interactive.createPrompter(input, output);
  const pending = prompter.ask('a: ');
  input.end();
  await assert.rejects(pending, interactive.PromptCancelled);
  await assert.rejects(prompter.ask('b: '), interactive.PromptCancelled);
});

function hi(home, args, input) {
  return spawnSync(process.execPath, ['dist/index.js', ...args], {
    encoding: 'utf8',
    env: { ...process.env, USERPROFILE: home, HOME: home },
    input,
  });
}

test('hi path add -i asks only for what is missing and saves the answers', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-int-home-'));
  const dir = project({ 'index.html': '<p>' });

  const added = hi(home, ['path', 'add', dir, '-i'], '\npiped\n管道名\n');
  assert.equal(added.status, 0, added.stderr);

  const listed = JSON.parse(hi(home, ['path', 'list', '--json']).stdout);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'piped');
  assert.equal(listed[0].name, '管道名');
  assert.deepEqual(listed[0].start, { kind: 'command', value: 'python -m http.server 8848' });
});

test('hi path add -i without a path asks for it first', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-int-home-'));
  const dir = project();

  const added = hi(home, ['path', 'add', '-i'], `${dir}\n-\ntwo\n\n`);
  assert.equal(added.status, 0, added.stderr);
  const listed = JSON.parse(hi(home, ['path', 'list', '--json']).stdout);
  assert.equal(listed[0].id, 'two');
  assert.equal(listed[0].start, undefined);
});

test('hi path add -i cancels cleanly when input ends early and saves nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-int-home-'));
  const dir = project();

  const added = hi(home, ['path', 'add', dir, '-i'], '');
  assert.equal(added.status, 1);
  assert.match(added.stderr + added.stdout, /已取消/);
  assert.deepEqual(JSON.parse(hi(home, ['path', 'list', '--json']).stdout), []);
});

test('without a terminal or -i, hi path add never prompts', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-int-home-'));
  const dir = project({ 'index.html': '<p>' });

  const added = hi(home, ['path', 'add', dir, '--id', 'quiet']);
  assert.equal(added.status, 0, added.stderr);
  const listed = JSON.parse(hi(home, ['path', 'list', '--json']).stdout);
  assert.equal(listed[0].start, undefined);

  const missing = hi(home, ['path', 'add']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /路径/);
});

test('hi path add resolves a relative path against the current directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-int-home-'));
  const root = project();
  mkdirSync(join(root, 'rel dir'));

  const result = spawnSync(process.execPath, [resolve('dist/index.js'), 'path', 'add', 'rel dir', '--id', 'rel'], {
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, USERPROFILE: home, HOME: home },
  });
  assert.equal(result.status, 0, result.stderr);
  const listed = JSON.parse(hi(home, ['path', 'list', '--json']).stdout);
  assert.equal(listed[0].path, resolve(root, 'rel dir').replace(/\\/g, '/'));
});
