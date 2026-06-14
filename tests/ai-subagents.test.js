const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

test('subagents inherit parent plan skills model and tool limits into default result notes', async () => {
  const { createSubagentQueue, enqueueSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });

  const task = enqueueSubagent(queue, {
    prompt: 'Review release workflow',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: ['read_file', 'search_files'],
    skillIds: ['frontend-design', 'test-driven-development'],
    modelId: 'model-a',
    currentPlan: 'Goal: ship desktop assets',
  });

  assert.equal(task.currentPlan, 'Goal: ship desktop assets');

  const completed = await runNextSubagent(queue);
  const notes = completed.result.notes.join('\n');

  assert.match(notes, /currentPlan=Goal: ship desktop assets/);
  assert.match(notes, /skillIds=frontend-design,test-driven-development/);
  assert.match(notes, /modelId=model-a/);
  assert.match(notes, /allowedTools=read_file,search_files/);
});

test('subagent message builder scopes task context without account telemetry behavior', () => {
  const { buildSubagentMessages } = require('../dist/chat/agent/prompt');

  const messages = buildSubagentMessages({
    prompt: 'Review release workflow',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: ['read_file', 'search_files'],
    skillIds: ['frontend-design'],
    modelId: 'model-a',
    currentPlan: 'Goal: ship desktop assets',
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[0].content, /Subagent Runtime/);
  assert.match(messages[0].content, /mode=agent/);
  assert.match(messages[0].content, /permissionMode=ask/);
  assert.match(messages[0].content, /allowedTools=read_file,search_files/);
  assert.match(messages[0].content, /skillIds=frontend-design/);
  assert.match(messages[0].content, /modelId=model-a/);
  assert.match(messages[0].content, /Current Plan/);
  assert.match(messages[0].content, /Goal: ship desktop assets/);
  assert.match(messages[1].content, /Review release workflow/);
  assert.doesNotMatch(messages.map((message) => message.content).join('\n'), /login|logout|oauth|telemetry|analytics|anthropic account/i);
});

test('AI subagent handler uses scoped prompt tool loop and allowed tool specs', async () => {
  const { createAiSubagentHandler } = require('../dist/chat/agent/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-ai-subagent-'));
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'subagent UTF-8 中文', 'utf8');
  const calls = [];
  const task = {
    id: 'sub-1',
    status: 'running',
    prompt: 'Read note.txt',
    mode: 'agent',
    permissionMode: 'bypass',
    allowedTools: ['read_file'],
    skillIds: ['test-driven-development'],
    modelId: 'model-a',
    currentPlan: 'Goal: verify subagent execution',
    createdAt: Date.now(),
  };

  const handler = createAiSubagentHandler({
    workspaceRoot,
    complete: async (messages, runningTask, tools) => {
      calls.push({ messages: messages.map((message) => message.content), tools: tools.map((tool) => tool.function.name), task: runningTask });
      if (calls.length === 1) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call-read',
            type: 'function',
            function: { name: 'read_file', arguments: JSON.stringify({ path: 'note.txt' }) },
          }],
        };
      }
      assert.equal(messages.at(-1).role, 'tool');
      assert.match(messages.at(-1).content, /subagent UTF-8 中文/);
      return { role: 'assistant', content: 'Read note.txt successfully.' };
    },
  });

  const result = await handler(task);

  assert.equal(result.summary, 'Read note.txt successfully.');
  assert.deepEqual(calls[0].tools, ['read_file']);
  assert.match(calls[0].messages[0], /Goal: verify subagent execution/);
  assert.equal(calls[0].task.id, 'sub-1');
  assert.match(result.notes.join('\n'), /toolResults=1/);
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

test('agent spawn command forwards the current plan into subagent tasks', () => {
  const source = require('node:fs').readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /currentPlan:\s*session\.currentPlan/);
});

test('agent spawn queue runs through AI subagent handler instead of placeholder handler', () => {
  const source = require('node:fs').readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /createAiSubagentHandler/);
  assert.match(source, /runNextSubagent\(hooks\.subagents,\s*createAiSubagentHandler/);
});
