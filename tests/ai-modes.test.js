const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('session starts in chat ask mode by default', () => {
  const { createSessionState } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'deepseek-v4-flash', autoAccept: false });

  assert.equal(state.mode, 'chat');
  assert.equal(state.permissionMode, 'ask');
  assert.equal(state.currentModelId, 'deepseek-v4-flash');
});

test('auto accept starts in agent bypass mode', () => {
  const { createSessionState } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'custom-model', autoAccept: true });

  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'bypass');
  assert.equal(state.currentModelId, 'custom-model');
});

test('mode transitions update permission mode without losing model', () => {
  const { createSessionState, setMode } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'model-a', autoAccept: false });

  setMode(state, 'plan');
  assert.equal(state.mode, 'plan');
  assert.equal(state.permissionMode, 'plan');
  assert.equal(state.currentModelId, 'model-a');

  setMode(state, 'agent');
  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'ask');

  setMode(state, 'chat');
  assert.equal(state.mode, 'chat');
  assert.equal(state.permissionMode, 'ask');
});

test('auto accept only keeps bypass in agent mode', () => {
  const { createSessionState, setMode } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'model-a', autoAccept: true });

  setMode(state, 'chat');
  assert.equal(state.mode, 'chat');
  assert.equal(state.permissionMode, 'ask');

  setMode(state, 'plan');
  assert.equal(state.mode, 'plan');
  assert.equal(state.permissionMode, 'plan');

  setMode(state, 'agent');
  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'bypass');
});

test('resolveModeCommand supports slash mode commands', () => {
  const { resolveModeCommand } = require('../dist/chat/modes');

  assert.deepEqual(resolveModeCommand('/chat'), { mode: 'chat' });
  assert.deepEqual(resolveModeCommand('/agent'), { mode: 'agent' });
  assert.deepEqual(resolveModeCommand('/plan'), { mode: 'plan' });
  assert.equal(resolveModeCommand('/model'), null);
});

test('/plan with inline text queues that text as the next user input', () => {
  const { resolveModeCommandAction } = require('../dist/chat/modes');

  assert.deepEqual(resolveModeCommandAction('/plan', '  先梳理风险，再列执行步骤  '), {
    mode: 'plan',
    nextInput: '先梳理风险，再列执行步骤',
  });
  assert.deepEqual(resolveModeCommandAction('/plan', ''), { mode: 'plan' });
  assert.deepEqual(resolveModeCommandAction('/chat', '只切模式，不提交'), { mode: 'chat' });
  assert.equal(resolveModeCommandAction('/model', 'info'), null);
});

test('chat loop consumes queued slash-command input before prompting again', () => {
  const source = readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /let\s+queuedInput:\s*string\s*\|\s*null\s*=\s*null/);
  assert.match(source, /queuedInput\s+\?\?\s+await ask\(\)/);
  assert.match(source, /'nextInput'\s+in\s+handled/);
});

test('mode metadata and cycle mirror Claude-style footer modes', () => {
  const { getModeConfig, getNextMode } = require('../dist/chat/modes');
  const { createSessionState } = require('../dist/chat/session');
  const normal = createSessionState({ modelId: 'model-a', autoAccept: false });
  const auto = createSessionState({ modelId: 'model-a', autoAccept: true });

  assert.deepEqual(getModeConfig('chat'), {
    title: 'Chat Mode',
    shortTitle: 'Chat',
    symbol: 'C',
    color: 'text',
    hint: 'read-only',
  });
  assert.deepEqual(getModeConfig('agent'), {
    title: 'Agent Mode',
    shortTitle: 'Agent',
    symbol: 'A',
    color: 'permission',
    hint: 'asks before tools',
  });
  assert.deepEqual(getModeConfig('plan'), {
    title: 'Plan Mode',
    shortTitle: 'Plan',
    symbol: 'P',
    color: 'plan',
    hint: 'no edits',
  });

  assert.equal(getNextMode(normal), 'agent');
  normal.mode = 'agent';
  normal.permissionMode = 'ask';
  assert.equal(getNextMode(normal), 'plan');
  normal.mode = 'plan';
  normal.permissionMode = 'plan';
  assert.equal(getNextMode(normal), 'chat');

  assert.equal(getNextMode(auto), 'chat');
  auto.mode = 'chat';
  auto.permissionMode = 'ask';
  assert.equal(getNextMode(auto), 'plan');
  auto.mode = 'plan';
  auto.permissionMode = 'plan';
  assert.equal(getNextMode(auto), 'agent');
});
