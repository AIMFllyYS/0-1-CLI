const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'cd desktop && npx tsc -p tsconfig.json'], { stdio: 'pipe' });

const { createStore } = require('../desktop/dist/renderer/state/store');

const SETTINGS = {
  ai: { defaultMode: 'chat', defaultModelId: '', autoAccept: false, maxToolRounds: 8 },
  github: { prefetch: true },
  startup: { cliAutostart: false, desktopAutostart: false },
  appearance: { theme: 'system' },
};

function fakeBridge(overrides = {}) {
  const calls = [];
  let listener = null;
  const state = {
    ok: true, version: '1.0.0', platform: 'win32', settings: SETTINGS,
    provider: { configured: true, baseUrl: 'https://a/v1', apiKeyMasked: 'sk-****', modelIds: ['m'], activeModelId: 'm' },
    workspace: 'D:/proj', recentWorkspaces: ['D:/proj'], loginItem: false,
    ...overrides.state,
  };
  const bridge = {
    invoke: async (channel, payload) => {
      calls.push({ channel, payload });
      if (overrides.handlers && overrides.handlers[channel]) return overrides.handlers[channel](payload);
      if (channel === 'app:getState') return state;
      if (channel === 'ai:createSession') return { ok: true, sessionId: `s${calls.filter((c) => c.channel === channel).length}`, workspace: payload.workspace || state.workspace, mode: payload.mode || 'agent', permissionMode: 'ask' };
      return { ok: true };
    },
    onAiEvent: (callback) => { listener = callback; return () => { listener = null; }; },
  };
  return { bridge, calls, emit: (payload) => listener && listener(payload), hasListener: () => listener !== null };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('init loads state, subscribes to events once, and exposes the first-run checklist', async () => {
  const { bridge, hasListener } = fakeBridge({ state: { provider: { configured: false, baseUrl: '', apiKeyMasked: '', modelIds: [], activeModelId: '' }, workspace: '' } });
  const store = createStore(bridge);
  assert.equal(store.getState().ready, false);

  await store.init();
  const s = store.getState();
  assert.equal(s.ready, true);
  assert.equal(hasListener(), true);
  assert.deepEqual(store.setup(), { needsWorkspace: true, needsProvider: true, complete: false });

  await store.init();
  assert.equal(store.getState().ready, true);
});

test('a missing bridge produces an explicit unavailable state instead of throwing', async () => {
  const store = createStore(undefined);
  await store.init();
  assert.equal(store.getState().ready, false);
  assert.equal(store.getState().bridgeMissing, true);
  assert.match(store.getState().fatal, /桥接|bridge/i);
});

test('state subscribers are notified on change and can unsubscribe', async () => {
  const { bridge } = fakeBridge();
  const store = createStore(bridge);
  let count = 0;
  const off = store.subscribe(() => { count += 1; });
  await store.init();
  const afterInit = count;
  assert.ok(afterInit > 0);
  off();
  await store.setPage('settings');
  assert.equal(count, afterInit);
});

test('newSession creates a session for the workspace and makes it active', async () => {
  const { bridge, calls } = fakeBridge();
  const store = createStore(bridge);
  await store.init();

  const result = await store.newSession();
  assert.equal(result.ok, true);
  const s = store.getState();
  assert.equal(s.sessions.length, 1);
  assert.equal(s.activeId, s.sessions[0].id);
  assert.equal(s.sessions[0].workspace, 'D:/proj');
  assert.equal(calls.find((c) => c.channel === 'ai:createSession').payload.workspace, 'D:/proj');
  assert.equal(s.page, 'chat');
});

test('newSession without a workspace reports the problem and creates nothing', async () => {
  const { bridge } = fakeBridge({
    state: { workspace: '' },
    handlers: { 'ai:createSession': () => ({ ok: false, error: '请先选择一个工作目录', code: 'no_workspace' }) },
  });
  const store = createStore(bridge);
  await store.init();
  const result = await store.newSession();
  assert.equal(result.ok, false);
  assert.equal(store.getState().sessions.length, 0);
  assert.match(store.getState().toast.text, /工作目录/);
});

test('send adds the user message, marks the session running and forwards the text', async () => {
  const { bridge, calls } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();

  assert.deepEqual(await store.send('  你好  '), { ok: true });
  const session = store.activeSession();
  assert.equal(session.running, true);
  assert.equal(session.items[0].text, '你好');
  assert.deepEqual(calls.at(-1), { channel: 'ai:send', payload: { sessionId: session.id, text: '你好' } });
});

test('send creates a session on demand and ignores blank input', async () => {
  const { bridge } = fakeBridge();
  const store = createStore(bridge);
  await store.init();

  assert.deepEqual(await store.send('   '), { ok: false, error: 'empty' });
  assert.equal(store.getState().sessions.length, 0);

  const result = await store.send('hello');
  assert.equal(result.ok, true);
  assert.equal(store.getState().sessions.length, 1);
});

test('a failed send rolls the running flag back and shows the reason', async () => {
  const { bridge } = fakeBridge({ handlers: { 'ai:send': () => ({ ok: false, error: '上一轮对话正在运行', code: 'busy' }) } });
  const store = createStore(bridge);
  await store.init();
  await store.newSession();

  const result = await store.send('x');
  assert.equal(result.ok, false);
  assert.equal(store.activeSession().running, false);
  assert.match(store.getState().toast.text, /正在运行/);
});

test('streamed events reach the right session even when it is not the active one', async () => {
  const { bridge, emit } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  await store.newSession();
  const [first, second] = store.getState().sessions;
  assert.equal(store.getState().activeId, second.id);

  emit({ sessionId: first.id, event: { type: 'token', text: 'background' } });
  const updated = store.getState().sessions.find((s) => s.id === first.id);
  assert.equal(updated.items[0].text, 'background');
  assert.equal(store.getState().sessions.find((s) => s.id === second.id).items.length, 0);

  emit({ sessionId: 'unknown', event: { type: 'token', text: 'x' } });
  assert.equal(store.getState().sessions.length, 2);
});

test('an inactive session that finishes or needs approval is flagged as unread', async () => {
  const { bridge, emit } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  await store.newSession();
  const [first] = store.getState().sessions;

  emit({ sessionId: first.id, event: { type: 'approval_request', approval: { id: 'a', kind: 'permission', toolCallId: 'c', toolName: 'shell', reason: 'r' } } });
  assert.equal(store.getState().sessions.find((s) => s.id === first.id).attention, 'approval');

  store.selectSession(first.id);
  assert.equal(store.getState().sessions.find((s) => s.id === first.id).attention, undefined);
});

test('approve sends the answer for the pending request and clears nothing until the host confirms', async () => {
  const { bridge, calls, emit } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  const id = store.activeSession().id;
  emit({ sessionId: id, event: { type: 'approval_request', approval: { id: 'ap1', kind: 'permission', toolCallId: 'c1', toolName: 'write_file', reason: 'r' } } });

  assert.deepEqual(await store.approve('allow_once'), { ok: true });
  assert.deepEqual(calls.at(-1), { channel: 'ai:approve', payload: { sessionId: id, approvalId: 'ap1', answer: 'allow_once' } });
  assert.ok(store.activeSession().items.some((item) => item.kind === 'approval' && item.answer === undefined));

  emit({ sessionId: id, event: { type: 'approval_resolved', id: 'ap1', answer: 'allow_once' } });
  assert.equal(store.activeSession().items.find((item) => item.kind === 'approval').answer, 'allow_once');
});

test('approve with feedback forwards the text and nothing happens without a pending request', async () => {
  const { bridge, calls, emit } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  assert.deepEqual(await store.approve('allow_once'), { ok: false, error: 'no_pending' });

  const id = store.activeSession().id;
  emit({ sessionId: id, event: { type: 'approval_request', approval: { id: 'ap1', kind: 'permission', toolCallId: 'c1', toolName: 'shell', reason: 'r' } } });
  await store.approve('deny_feedback', '用 npm 不要用 yarn');
  assert.equal(calls.at(-1).payload.feedback, '用 npm 不要用 yarn');
});

test('stop aborts only when a turn is running', async () => {
  const { bridge, calls } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  const before = calls.length;
  await store.stop();
  assert.equal(calls.length, before, 'no abort call for an idle session');

  await store.send('go');
  await store.stop();
  assert.equal(calls.at(-1).channel, 'ai:abort');
});

test('setMode updates the session on success and keeps it on failure', async () => {
  let fail = false;
  const { bridge } = fakeBridge({
    handlers: { 'ai:setMode': (p) => (fail ? { ok: false, error: '运行中无法切换' } : { ok: true, mode: p.mode, permissionMode: p.mode === 'plan' ? 'plan' : 'ask' }) },
  });
  const store = createStore(bridge);
  await store.init();
  await store.newSession();

  await store.setMode('plan');
  assert.deepEqual([store.activeSession().mode, store.activeSession().permissionMode], ['plan', 'plan']);
  fail = true;
  await store.setMode('chat');
  assert.equal(store.activeSession().mode, 'plan');
  assert.match(store.getState().toast.text, /运行中/);
});

test('closing a session selects a neighbour and the last close leaves an empty list', async () => {
  const { bridge, calls } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  await store.newSession();
  const [a, b] = store.getState().sessions;

  await store.closeSession(b.id);
  assert.equal(store.getState().activeId, a.id);
  assert.equal(calls.filter((c) => c.channel === 'ai:close').length, 1);
  await store.closeSession(a.id);
  assert.equal(store.getState().sessions.length, 0);
  assert.equal(store.getState().activeId, '');
});

test('setSetting applies the value on success and reverts and explains on failure', async () => {
  const { bridge } = fakeBridge({
    handlers: { 'settings:set': (p) => (p.key === 'ai.maxToolRounds' ? { ok: false, error: 'ai.maxToolRounds 必须在 1 到 50 之间' } : { ok: true, key: p.key, value: p.value, warning: p.key === 'ai.autoAccept' ? '已开启自动接受' : undefined }) },
  });
  const store = createStore(bridge);
  await store.init();

  await store.setSetting('github.prefetch', false);
  assert.equal(store.getState().settings.github.prefetch, false);

  await store.setSetting('ai.maxToolRounds', 0);
  assert.equal(store.getState().settings.ai.maxToolRounds, 8);
  assert.match(store.getState().toast.text, /1 到 50/);

  await store.setSetting('ai.autoAccept', true);
  assert.equal(store.getState().settings.ai.autoAccept, true);
  assert.match(store.getState().toast.text, /自动接受/);
});

test('theme resolves from the setting and the system preference', async () => {
  const { bridge } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  assert.equal(store.resolvedTheme(true), 'dark');
  assert.equal(store.resolvedTheme(false), 'light');
  await store.setSetting('appearance.theme', 'light');
  assert.equal(store.resolvedTheme(true), 'light');
  await store.setSetting('appearance.theme', 'dark');
  assert.equal(store.resolvedTheme(false), 'dark');
});

test('saveProvider refreshes the masked view and never stores the key it sent', async () => {
  const { bridge } = fakeBridge({
    handlers: { 'provider:save': () => ({ ok: true, provider: { configured: true, baseUrl: 'https://n/v1', apiKeyMasked: 'sk-n***', modelIds: ['n'], activeModelId: 'n' } }) },
  });
  const store = createStore(bridge);
  await store.init();

  const result = await store.saveProvider({ baseUrl: 'https://n/v1', apiKey: 'sk-very-secret', modelIds: ['n'], activeModelId: 'n' });
  assert.equal(result.ok, true);
  assert.equal(store.getState().provider.apiKeyMasked, 'sk-n***');
  assert.equal(JSON.stringify(store.getState()).includes('very-secret'), false);
});

test('chooseWorkspace stores the picked folder and a cancelled dialog changes nothing', async () => {
  let picked;
  const { bridge } = fakeBridge({ handlers: { 'workspace:choose': () => ({ ok: true, path: picked }) } });
  const store = createStore(bridge);
  await store.init();

  picked = undefined;
  await store.chooseWorkspace();
  assert.equal(store.getState().workspace, 'D:/proj');

  picked = 'D:/other';
  await store.chooseWorkspace();
  assert.equal(store.getState().workspace, 'D:/other');
  assert.equal(store.getState().recentWorkspaces[0], 'D:/other');
});

test('GitHub summary loads lazily, respects prefetch and keeps the last good value on failure', async () => {
  let fail = false;
  const { bridge, calls } = fakeBridge({
    handlers: { 'github:summary': () => (fail ? { ok: false, error: 'offline' } : { ok: true, available: true, accounts: [], activeUsername: 'me', issues: [], totalIssues: 0 }) },
  });
  const store = createStore(bridge);
  await store.init();

  await store.loadGithub();
  assert.equal(store.getState().github.status, 'ready');
  assert.equal(store.getState().github.data.activeUsername, 'me');

  fail = true;
  await store.loadGithub({ force: true });
  assert.equal(store.getState().github.status, 'error');
  assert.equal(store.getState().github.data.activeUsername, 'me');
  assert.equal(calls.filter((c) => c.channel === 'github:summary').length, 2);
});

test('a skipped GitHub summary is shown as disabled rather than as an error', async () => {
  const { bridge } = fakeBridge({ handlers: { 'github:summary': () => ({ ok: true, skipped: true }) } });
  const store = createStore(bridge);
  await store.init();
  await store.loadGithub();
  assert.equal(store.getState().github.status, 'disabled');
});

test('toasts clear themselves by id and a newer toast is not removed by an older timer', async () => {
  const { bridge } = fakeBridge({ handlers: { 'ai:createSession': () => ({ ok: false, error: 'first' }) } });
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  const first = store.getState().toast;
  await store.newSession();
  const second = store.getState().toast;
  assert.notEqual(first.id, second.id);

  store.dismissToast(first.id);
  assert.equal(store.getState().toast.id, second.id);
  store.dismissToast(second.id);
  assert.equal(store.getState().toast, undefined);
});

test('the number of pending approvals across sessions is counted for the sidebar', async () => {
  const { bridge, emit } = fakeBridge();
  const store = createStore(bridge);
  await store.init();
  await store.newSession();
  await store.newSession();
  const ids = store.getState().sessions.map((s) => s.id);
  for (const id of ids) emit({ sessionId: id, event: { type: 'approval_request', approval: { id: `a-${id}`, kind: 'permission', toolCallId: 'c', toolName: 'shell', reason: 'r' } } });
  assert.equal(store.pendingApprovalCount(), 2);
  await tick();
});

test('launch entries load, report a corrupt registry, and run only by id', async () => {
  let registry = { ok: true, entries: [{ id: 'ds', name: 'DS', path: 'D:/ds', start: 'python -m http.server', kind: 'command' }] };
  const { bridge, calls } = fakeBridge({
    handlers: {
      'launch:list': () => registry,
      'launch:run': (payload) => (payload.id === 'ds' ? { ok: true, terminal: 'wt' } : { ok: false, error: '未找到 id' }),
    },
  });
  const store = createStore(bridge);
  await store.init();

  await store.loadLaunch();
  assert.equal(store.getState().launch.status, 'ready');
  assert.equal(store.getState().launch.entries[0].id, 'ds');

  assert.deepEqual(await store.runLaunch('ds'), { ok: true });
  assert.deepEqual(calls.at(-1), { channel: 'launch:run', payload: { id: 'ds' } });
  assert.match(store.getState().toast.text, /DS|ds/);

  assert.equal((await store.runLaunch('ghost')).ok, false);
  assert.match(store.getState().toast.text, /未找到/);

  registry = { ok: false, error: '配置文件无法解析' };
  await store.loadLaunch();
  assert.equal(store.getState().launch.status, 'error');
  assert.match(store.getState().launch.error, /配置文件/);
  assert.equal(store.getState().launch.entries[0].id, 'ds', 'the last good list is kept');
});

test('callTool only forwards the whitelisted native tool channels', async () => {
  const { bridge, calls } = fakeBridge({ handlers: { 'desktop-install:list': () => [{ key: 'cc' }] } });
  const store = createStore(bridge);
  await store.init();
  const before = calls.length;

  assert.deepEqual(await store.callTool('desktop-install:list'), [{ key: 'cc' }]);
  assert.equal(calls.length, before + 1);

  for (const bad of ['ai:send', 'settings:set', 'shell:exec', '', undefined, 42]) {
    const result = await store.callTool(bad, {});
    assert.equal(result.ok, false, String(bad));
  }
  assert.equal(calls.length, before + 1, 'blocked channels never reach the bridge');
});
