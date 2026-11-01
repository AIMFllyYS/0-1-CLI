const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const ENV_KEYS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_MODELS'];

function freshHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-dapi-home-'));
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  // Never touch the real Windows startup folder from a test.
  process.env.HI_STARTUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-dapi-startup-'));
  ENV_KEYS.forEach((key) => delete process.env[key]);
  // Drop every cached dist module: several of them (config, launch registry) bind the home directory at load time.
  const distRoot = (path.resolve('dist') + path.sep).toLowerCase();
  for (const key of Object.keys(require.cache)) {
    if (key.toLowerCase().startsWith(distRoot)) delete require.cache[key];
  }
  return home;
}

function dir(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-dapi-ws-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content, 'utf8');
  }
  return root;
}

function assistant(content, toolCalls) {
  return { role: 'assistant', content, tool_calls: toolCalls };
}
function toolCall(id, name, args) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function makeApi(overrides = {}) {
  const { createDesktopApi } = require('../dist/desktop/api');
  const emitted = [];
  const calls = { loginItem: [], launched: [], github: 0, opened: [] };
  const script = overrides.script ? [...overrides.script] : [];
  const api = createDesktopApi({
    emit: (channel, payload) => emitted.push({ channel, payload }),
    chooseDirectory: async () => overrides.chosen,
    setLoginItem: (enabled) => {
      if (overrides.loginItemError) throw new Error(overrides.loginItemError);
      calls.loginItem.push(enabled);
    },
    getLoginItem: () => calls.loginItem.at(-1) ?? false,
    runLaunch: async (entry) => { calls.launched.push(entry.id); return { terminal: 'wt' }; },
    githubSummary: async () => { calls.github += 1; return { ok: true, available: true, accounts: [], activeUsername: '', issues: [], totalIssues: 0 }; },
    complete: async (messages, tools, hooks) => {
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      return typeof next === 'function' ? next(hooks, messages) : next;
    },
    platform: overrides.platform ?? 'win32',
    version: '9.9.9',
  });
  return { api, emitted, calls };
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 400; i += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const approvalsOf = (emitted, sessionId) => emitted
  .filter((e) => e.channel === 'ai:event' && e.payload.sessionId === sessionId && e.payload.event.type === 'approval_request');

async function newSession(api, workspace, extra = {}) {
  const created = await api.invoke('ai:createSession', { workspace, mode: 'agent', ...extra });
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.sessionId;
}

test('channels are an exact whitelist and unknown channels never throw', async () => {
  freshHome();
  const { api } = makeApi();
  assert.deepEqual([...api.channels].sort(), [
    'ai:abort', 'ai:approve', 'ai:close', 'ai:createSession', 'ai:reset', 'ai:send', 'ai:setMode',
    'app:getState', 'github:summary', 'launch:list', 'launch:run',
    'provider:save', 'settings:reset', 'settings:set',
    'workspace:choose', 'workspace:set',
  ].sort());

  assert.deepEqual(await api.invoke('shell:exec', { command: 'calc' }), { ok: false, error: 'Unknown channel: shell:exec', code: 'unknown_channel' });
  assert.equal((await api.invoke(undefined, {})).ok, false);
  assert.equal((await api.invoke('__proto__', {})).ok, false);
});

test('every channel is namespaced, unique and the list cannot be mutated by a caller', () => {
  freshHome();
  const { api } = makeApi();
  const channels = [...api.channels];
  assert.equal(new Set(channels).size, channels.length);
  channels.forEach((channel) => assert.match(channel, /^[a-z]+:[A-Za-z]+$/));
  assert.throws(() => { api.channels.push('evil:channel'); }, TypeError);
});

test('app:getState returns settings, a masked provider and never the api key', async () => {
  const home = freshHome();
  fs.writeFileSync(path.join(home, '.coding-cli.json'), JSON.stringify({
    provider: { baseUrl: 'https://a.example.com/v1', apiKey: 'sk-very-secret-key-1234', modelIds: ['m'], activeModelId: 'm' },
  }), 'utf8');
  const { api } = makeApi();

  const state = await api.invoke('app:getState');
  assert.equal(state.ok, true);
  assert.equal(state.version, '9.9.9');
  assert.equal(state.platform, 'win32');
  assert.equal(state.settings.github.prefetch, true);
  assert.equal(state.provider.configured, true);
  assert.equal(state.provider.baseUrl, 'https://a.example.com/v1');
  assert.equal(JSON.stringify(state).includes('very-secret'), false);
  assert.equal(state.workspace, '');
});

test('settings:set validates, persists and returns warnings', async () => {
  const home = freshHome();
  const { api } = makeApi();

  const ok = await api.invoke('settings:set', { key: 'ai.defaultMode', value: 'plan' });
  assert.deepEqual({ ok: ok.ok, value: ok.value }, { ok: true, value: 'plan' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.coding-cli.json'), 'utf8')).settings.ai.defaultMode, 'plan');

  assert.match((await api.invoke('settings:set', { key: 'ai.autoAccept', value: true })).warning, /自动接受/);
  assert.equal((await api.invoke('settings:set', { key: 'nope.key', value: 1 })).ok, false);
  assert.equal((await api.invoke('settings:set', { key: 'ai.maxToolRounds', value: 0 })).ok, false);
  assert.equal((await api.invoke('settings:set', { key: 'provider.apiKey', value: 'x' })).ok, false);
  assert.equal((await api.invoke('settings:set', null)).ok, false);
  assert.equal((await api.invoke('settings:set', 'ai.defaultMode')).ok, false);
  assert.equal((await api.invoke('settings:set', { key: { toString: () => 'ai.defaultMode' }, value: 'chat' })).ok, false);
});

test('settings:set for desktop autostart applies the login item first and does not persist on failure', async () => {
  const home = freshHome();
  const good = makeApi();
  assert.equal((await good.api.invoke('settings:set', { key: 'startup.desktopAutostart', value: true })).ok, true);
  assert.deepEqual(good.calls.loginItem, [true]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.coding-cli.json'), 'utf8')).settings.startup.desktopAutostart, true);

  const home2 = freshHome();
  const bad = makeApi({ loginItemError: '仅安装版支持开机启动' });
  const result = await bad.api.invoke('settings:set', { key: 'startup.desktopAutostart', value: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /仅安装版/);
  assert.equal(fs.existsSync(path.join(home2, '.coding-cli.json')), false);
});

test('init syncs the login item to the stored desktop autostart setting', async () => {
  const home = freshHome();
  fs.writeFileSync(path.join(home, '.coding-cli.json'), JSON.stringify({ settings: { startup: { desktopAutostart: true } } }), 'utf8');
  const { api, calls } = makeApi();
  await api.init();
  assert.deepEqual(calls.loginItem, [true]);

  freshHome();
  const second = makeApi({ loginItemError: 'dev build' });
  await assert.doesNotReject(second.api.init());
});

test('settings:reset restores one key or everything', async () => {
  freshHome();
  const { api } = makeApi();
  await api.invoke('settings:set', { key: 'ai.maxToolRounds', value: 20 });
  await api.invoke('settings:set', { key: 'ai.defaultMode', value: 'agent' });

  assert.equal((await api.invoke('settings:reset', { key: 'ai.maxToolRounds' })).ok, true);
  let state = await api.invoke('app:getState');
  assert.equal(state.settings.ai.maxToolRounds, 8);
  assert.equal(state.settings.ai.defaultMode, 'agent');

  assert.equal((await api.invoke('settings:reset', {})).ok, true);
  state = await api.invoke('app:getState');
  assert.equal(state.settings.ai.defaultMode, 'chat');
  assert.equal((await api.invoke('settings:reset', { key: 'bad.key' })).ok, false);
});

test('provider:save validates, applies to the environment and returns only a masked view', async () => {
  freshHome();
  const { api } = makeApi();

  const bad = await api.invoke('provider:save', { baseUrl: 'nope', apiKey: 'k', modelIds: ['m'], activeModelId: 'm' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /URL/);
  assert.equal((await api.invoke('provider:save', { baseUrl: 'https://a.example.com/v1', apiKey: 'k', modelIds: 'm', activeModelId: 'm' })).ok, false);
  assert.equal((await api.invoke('provider:save', null)).ok, false);

  process.env.AI_API_KEY = 'stale-from-shell';
  const saved = await api.invoke('provider:save', {
    baseUrl: 'https://a.example.com/v1', apiKey: 'sk-brand-new-key-5678', modelIds: ['m1', 'm2'], activeModelId: 'm2',
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.provider.activeModelId, 'm2');
  assert.equal(JSON.stringify(saved).includes('brand-new-key'), false);
  assert.equal(process.env.AI_API_KEY, 'sk-brand-new-key-5678', 'the desktop process uses the key it just saved');
  assert.equal(process.env.AI_MODEL, 'm2');

  const kept = await api.invoke('provider:save', { baseUrl: 'https://b.example.com/v1', apiKey: '', modelIds: ['m1'], activeModelId: 'm1' });
  assert.equal(kept.ok, true);
  assert.equal(process.env.AI_API_KEY, 'sk-brand-new-key-5678');
  assert.equal(process.env.AI_BASE_URL, 'https://b.example.com/v1');
});

test('workspace:choose and workspace:set validate the directory and remember it', async () => {
  freshHome();
  const chosen = dir();
  const { api } = makeApi({ chosen });

  const picked = await api.invoke('workspace:choose');
  assert.equal(picked.ok, true);
  assert.equal(picked.path, path.resolve(chosen));
  assert.equal((await api.invoke('app:getState')).workspace, path.resolve(chosen));

  const cancelled = makeApi({ chosen: undefined });
  assert.deepEqual(await cancelled.api.invoke('workspace:choose'), { ok: true, path: undefined });

  const another = dir();
  assert.equal((await api.invoke('workspace:set', { path: another })).ok, true);
  const state = await api.invoke('app:getState');
  assert.equal(state.workspace, path.resolve(another));
  assert.deepEqual(state.recentWorkspaces.slice(0, 2), [path.resolve(another), path.resolve(chosen)]);

  const file = path.join(another, 'f.txt');
  fs.writeFileSync(file, 'x');
  assert.equal((await api.invoke('workspace:set', { path: file })).ok, false);
  assert.equal((await api.invoke('workspace:set', { path: path.join(another, 'missing') })).ok, false);
  assert.equal((await api.invoke('workspace:set', { path: 'relative/dir' })).ok, false);
  assert.equal((await api.invoke('workspace:set', { path: path.parse(another).root })).ok, false);
  assert.equal((await api.invoke('workspace:set', { path: 42 })).ok, false);
});

test('a workspace that disappeared is not reported as the current one', async () => {
  freshHome();
  const gone = dir();
  const { api } = makeApi({ chosen: gone });
  await api.invoke('workspace:choose');
  fs.rmSync(gone, { recursive: true, force: true });
  assert.equal((await api.invoke('app:getState')).workspace, '');
});

test('github:summary honors the prefetch setting unless forced', async () => {
  freshHome();
  const { api, calls } = makeApi();

  assert.equal((await api.invoke('github:summary', {})).ok, true);
  assert.equal(calls.github, 1);

  await api.invoke('settings:set', { key: 'github.prefetch', value: false });
  const skipped = await api.invoke('github:summary', {});
  assert.deepEqual({ ok: skipped.ok, skipped: skipped.skipped }, { ok: true, skipped: true });
  assert.equal(calls.github, 1, 'no GitHub call when prefetch is off');

  assert.equal((await api.invoke('github:summary', { force: true })).skipped, undefined);
  assert.equal(calls.github, 2);
});

test('ai:createSession needs a workspace and validates mode', async () => {
  freshHome();
  const { api } = makeApi();

  const none = await api.invoke('ai:createSession', {});
  assert.equal(none.ok, false);
  assert.equal(none.code, 'no_workspace');

  const ws = dir();
  assert.equal((await api.invoke('ai:createSession', { workspace: ws, mode: 'turbo' })).ok, false);
  assert.equal((await api.invoke('ai:createSession', { workspace: path.join(ws, 'nope') })).ok, false);
  assert.equal((await api.invoke('ai:createSession', { workspace: path.parse(ws).root })).ok, false);

  const created = await api.invoke('ai:createSession', { workspace: ws, mode: 'plan' });
  assert.deepEqual(
    { ok: created.ok, mode: created.mode, permissionMode: created.permissionMode, workspace: created.workspace },
    { ok: true, mode: 'plan', permissionMode: 'plan', workspace: path.resolve(ws) },
  );
  assert.match(created.sessionId, /^[0-9a-f-]{36}$/);

  await api.invoke('workspace:set', { path: ws });
  const fromStored = await api.invoke('ai:createSession', {});
  assert.equal(fromStored.ok, true);
  assert.equal(fromStored.mode, 'chat');
});

test('new sessions follow the saved defaults for mode and auto accept', async () => {
  freshHome();
  const ws = dir();
  const { api } = makeApi();
  await api.invoke('settings:set', { key: 'ai.defaultMode', value: 'agent' });
  await api.invoke('settings:set', { key: 'ai.autoAccept', value: true });

  const created = await api.invoke('ai:createSession', { workspace: ws });
  assert.deepEqual({ mode: created.mode, permissionMode: created.permissionMode }, { mode: 'agent', permissionMode: 'bypass' });
});

test('a full turn streams tagged events, asks for approval, writes after allow and ends with turn_end', async () => {
  freshHome();
  const ws = dir({ 'a.txt': 'one\n' });
  const { api, emitted } = makeApi({
    script: [
      (hooks) => { hooks.onToken('Editing '); return assistant('Editing', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'two\n' })]); },
      assistant('Done'),
    ],
  });
  const sessionId = await newSession(api, ws);

  const sent = await api.invoke('ai:send', { sessionId, text: 'change it' });
  assert.deepEqual(sent, { ok: true });

  const request = (await waitFor(() => approvalsOf(emitted, sessionId)[0], 'approval')).payload.event.approval;
  assert.equal(request.toolName, 'write_file');
  assert.equal(request.file.operation, 'overwrite');
  assert.equal(fs.readFileSync(path.join(ws, 'a.txt'), 'utf8'), 'one\n');

  assert.deepEqual(await api.invoke('ai:approve', { sessionId, approvalId: request.id, answer: 'allow_once' }), { ok: true });
  const end = await waitFor(() => emitted.find((e) => e.payload.event?.type === 'turn_end'), 'turn_end');

  assert.equal(end.payload.sessionId, sessionId);
  assert.deepEqual(end.payload.event.result, { status: 'completed', message: 'Done', limitReached: false });
  assert.equal(fs.readFileSync(path.join(ws, 'a.txt'), 'utf8'), 'two\n');
  assert.ok(emitted.every((e) => e.channel === 'ai:event' && e.payload.sessionId === sessionId));
  assert.ok(emitted.some((e) => e.payload.event.type === 'token'));
});

test('approvals are validated and bound to their own session', async () => {
  freshHome();
  const ws = dir();
  const { api, emitted } = makeApi({
    script: [
      assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'x' })]),
      assistant('', [toolCall('w2', 'write_file', { path: 'b.txt', content: 'y' })]),
    ],
  });
  const first = await newSession(api, ws);
  const second = await newSession(api, ws);

  await api.invoke('ai:send', { sessionId: first, text: 'a' });
  await api.invoke('ai:send', { sessionId: second, text: 'b' });
  const firstRequest = (await waitFor(() => approvalsOf(emitted, first)[0], 'first approval')).payload.event.approval;
  await waitFor(() => approvalsOf(emitted, second)[0], 'second approval');

  const crossed = await api.invoke('ai:approve', { sessionId: second, approvalId: firstRequest.id, answer: 'allow_once' });
  assert.equal(crossed.ok, false);
  assert.equal(fs.existsSync(path.join(ws, 'a.txt')), false);

  assert.equal((await api.invoke('ai:approve', { sessionId: first, approvalId: firstRequest.id, answer: 'run_anything' })).ok, false);
  assert.equal((await api.invoke('ai:approve', { sessionId: first, approvalId: firstRequest.id, answer: 'approve' })).ok, false, 'a plan answer is not valid for a permission request');
  assert.equal((await api.invoke('ai:approve', { sessionId: first, approvalId: 42, answer: 'deny' })).ok, false);
  assert.equal((await api.invoke('ai:approve', { sessionId: 'nope', approvalId: 'x', answer: 'deny' })).ok, false);
  assert.equal(fs.existsSync(path.join(ws, 'a.txt')), false);

  await api.invoke('ai:abort', { sessionId: first });
  await api.invoke('ai:abort', { sessionId: second });
});

test('ai:send rejects bad input, unknown sessions and a second send while running', async () => {
  freshHome();
  const ws = dir();
  const { api, emitted } = makeApi({
    script: [(hooks) => new Promise((resolve, reject) => {
      hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    })],
  });
  const sessionId = await newSession(api, ws);

  assert.equal((await api.invoke('ai:send', { sessionId: 'nope', text: 'x' })).ok, false);
  assert.equal((await api.invoke('ai:send', { sessionId, text: '   ' })).ok, false);
  assert.equal((await api.invoke('ai:send', { sessionId, text: 5 })).ok, false);
  assert.equal((await api.invoke('ai:send', { sessionId, text: 'x'.repeat(100001) })).ok, false);
  assert.equal((await api.invoke('ai:send', undefined)).ok, false);

  assert.equal((await api.invoke('ai:send', { sessionId, text: 'long task' })).ok, true);
  const second = await api.invoke('ai:send', { sessionId, text: 'again' });
  assert.equal(second.ok, false);
  assert.match(second.error, /正在运行|running/);

  assert.deepEqual(await api.invoke('ai:abort', { sessionId }), { ok: true });
  const end = await waitFor(() => emitted.find((e) => e.payload.event?.type === 'turn_end'), 'turn_end');
  assert.equal(end.payload.event.result.status, 'cancelled');
});

test('a failing turn is reported as an error event instead of an unhandled rejection', async () => {
  freshHome();
  const ws = dir();
  const { api, emitted } = makeApi({ script: [() => { throw new Error('provider exploded'); }] });
  const sessionId = await newSession(api, ws);

  await api.invoke('ai:send', { sessionId, text: 'x' });
  const end = await waitFor(() => emitted.find((e) => e.payload.event?.type === 'turn_end'), 'turn_end');
  assert.deepEqual(end.payload.event.result, { status: 'error', error: 'provider exploded' });
});

test('mode changes and resets are refused mid-turn with an error result, not an exception', async () => {
  freshHome();
  const ws = dir();
  const { api, emitted } = makeApi({
    script: [(hooks) => new Promise((resolve, reject) => {
      hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    })],
  });
  const sessionId = await newSession(api, ws);

  const changed = await api.invoke('ai:setMode', { sessionId, mode: 'plan' });
  assert.deepEqual({ ok: changed.ok, mode: changed.mode, permissionMode: changed.permissionMode }, { ok: true, mode: 'plan', permissionMode: 'plan' });
  assert.equal((await api.invoke('ai:setMode', { sessionId, mode: 'warp' })).ok, false);

  await api.invoke('ai:send', { sessionId, text: 'go' });
  assert.equal((await api.invoke('ai:setMode', { sessionId, mode: 'agent' })).ok, false);
  assert.equal((await api.invoke('ai:reset', { sessionId })).ok, false);
  await api.invoke('ai:abort', { sessionId });
  await waitFor(() => emitted.find((e) => e.payload.event?.type === 'turn_end'), 'turn_end');
  assert.equal((await api.invoke('ai:reset', { sessionId })).ok, true);
});

test('closing a session aborts it and forgets it', async () => {
  freshHome();
  const ws = dir();
  const { api, emitted } = makeApi({
    script: [(hooks) => new Promise((resolve, reject) => {
      hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    })],
  });
  const sessionId = await newSession(api, ws);
  await api.invoke('ai:send', { sessionId, text: 'go' });

  assert.deepEqual(await api.invoke('ai:close', { sessionId }), { ok: true });
  await waitFor(() => emitted.find((e) => e.payload.event?.type === 'turn_end'), 'turn_end');
  assert.equal((await api.invoke('ai:send', { sessionId, text: 'x' })).ok, false);
  assert.equal((await api.invoke('ai:close', { sessionId })).ok, true, 'closing twice is harmless');
});

test('the number of open sessions is capped', async () => {
  freshHome();
  const ws = dir();
  const { api } = makeApi();
  for (let i = 0; i < 20; i += 1) await newSession(api, ws);
  const over = await api.invoke('ai:createSession', { workspace: ws });
  assert.equal(over.ok, false);
  assert.match(over.error, /20/);
});

test('dispose aborts every running turn', async () => {
  freshHome();
  const ws = dir();
  const { api, emitted } = makeApi({
    script: [
      (hooks) => new Promise((resolve, reject) => hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })))),
      (hooks) => new Promise((resolve, reject) => hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })))),
    ],
  });
  const a = await newSession(api, ws);
  const b = await newSession(api, ws);
  await api.invoke('ai:send', { sessionId: a, text: 'x' });
  await api.invoke('ai:send', { sessionId: b, text: 'y' });

  api.dispose();
  await waitFor(() => emitted.filter((e) => e.payload.event?.type === 'turn_end').length === 2, 'both turns end');
});

test('launch:list exposes only safe fields and launch:run runs a registered id and nothing else', async () => {
  freshHome();
  const project = dir();
  const { addLaunch } = require('../dist/modules/launch/registry');
  addLaunch({ path: project, id: 'demo', start: 'python -m http.server 8848' });
  const { api, calls } = makeApi();

  const listed = await api.invoke('launch:list');
  assert.equal(listed.ok, true);
  assert.deepEqual(Object.keys(listed.entries[0]).sort(), ['id', 'kind', 'name', 'path', 'start']);
  assert.equal(listed.entries[0].start, 'python -m http.server 8848');

  const ran = await api.invoke('launch:run', { id: 'demo', command: 'calc.exe', path: 'C:/Windows', start: 'evil' });
  assert.deepEqual({ ok: ran.ok, terminal: ran.terminal }, { ok: true, terminal: 'wt' });
  assert.deepEqual(calls.launched, ['demo']);

  assert.equal((await api.invoke('launch:run', { id: 'ghost' })).ok, false);
  assert.equal((await api.invoke('launch:run', { id: 7 })).ok, false);
  assert.equal((await api.invoke('launch:run', null)).ok, false);
  assert.deepEqual(calls.launched, ['demo']);
});

test('launch:list reports a corrupt registry instead of throwing', async () => {
  const home = freshHome();
  fs.writeFileSync(path.join(home, '.coding-cli.json'), '{ "launch": [', 'utf8');
  const { api } = makeApi();
  const listed = await api.invoke('launch:list');
  assert.equal(listed.ok, false);
  assert.match(listed.error, /配置文件/);
});

test('the api module does not expose a generic shell, file or command channel', () => {
  freshHome();
  const { api } = makeApi();
  for (const channel of api.channels) {
    assert.doesNotMatch(channel, /exec|shell|spawn|command|fs:|readFile|writeFile|eval/i, channel);
  }
});
