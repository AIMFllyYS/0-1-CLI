const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('subagent queue moves queued to running then completed with structured result', async () => {
  const { createSubagentQueue, enqueueSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });

  const task = enqueueSubagent(queue, { prompt: 'Review permission code', mode: 'agent', permissionMode: 'ask', allowedTools: ['read_file'] });
  assert.equal(task.status, 'queued');
  assert.equal(task.mode, 'agent');

  const result = await runNextSubagent(queue, async (running) => {
    assert.equal(running.status, 'running');
    return { summary: 'Reviewed permission code', notes: ['No writes needed'] };
  });

  assert.equal(result.status, 'completed');
  assert.equal(queue.items[0].status, 'completed');
  assert.equal(queue.items[0].result.summary, 'Reviewed permission code');
  assert.deepEqual(queue.items[0].result.notes, ['No writes needed']);
});

test('subagent permissions can narrow but not widen parent permissions', () => {
  const { createSubagentQueue, enqueueSubagent } = require('../dist/chat/agent/subagents');

  const askQueue = createSubagentQueue({ parentPermissionMode: 'ask' });
  assert.equal(enqueueSubagent(askQueue, { prompt: 'try bypass', permissionMode: 'bypass' }).permissionMode, 'ask');
  assert.equal(enqueueSubagent(askQueue, { prompt: 'plan only', permissionMode: 'plan' }).permissionMode, 'plan');

  const planQueue = createSubagentQueue({ parentPermissionMode: 'plan' });
  assert.equal(enqueueSubagent(planQueue, { prompt: 'try ask', permissionMode: 'ask' }).permissionMode, 'plan');

  const bypassQueue = createSubagentQueue({ parentPermissionMode: 'bypass' });
  assert.equal(enqueueSubagent(bypassQueue, { prompt: 'keep bypass', permissionMode: 'bypass' }).permissionMode, 'bypass');
});

test('cancelling a queued or running subagent changes status to cancelled', async () => {
  const { createSubagentQueue, enqueueSubagent, cancelSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });
  const queued = enqueueSubagent(queue, { prompt: 'queued' });
  const running = enqueueSubagent(queue, { prompt: 'running' });

  assert.equal(cancelSubagent(queue, queued.id).status, 'cancelled');
  const run = runNextSubagent(queue, async () => ({ summary: 'should not complete' }));
  assert.equal(queue.items.find((item) => item.id === running.id).status, 'running');
  assert.equal(cancelSubagent(queue, running.id).status, 'cancelled');
  const result = await run;

  assert.equal(result.status, 'cancelled');
  assert.equal(queue.items.find((item) => item.id === running.id).status, 'cancelled');
});

test('completed subagents are not reported as newly cancelled', () => {
  const { createSubagentQueue, enqueueSubagent, cancelSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });
  const task = enqueueSubagent(queue, { prompt: 'done' });
  task.status = 'completed';

  const result = cancelSubagent(queue, task.id);

  assert.equal(result.status, 'completed');
});

test('agent slash command parser supports spawn list and cancel', () => {
  const { resolveAgentCommand } = require('../dist/chat/agent/subagents');

  assert.deepEqual(resolveAgentCommand(''), { kind: 'mode' });
  assert.deepEqual(resolveAgentCommand('list'), { kind: 'list' });
  assert.deepEqual(resolveAgentCommand('cancel sub-1'), { kind: 'cancel', id: 'sub-1' });
  assert.deepEqual(resolveAgentCommand('spawn Review files'), { kind: 'spawn', prompt: 'Review files' });
});
