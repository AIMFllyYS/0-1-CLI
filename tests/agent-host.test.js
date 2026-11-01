const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const { AgentHost } = require('../dist/chat/agent/host');
const { buildLineDiff } = require('../dist/chat/tools/diff');

function workspace(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-host-ws-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  return dir;
}

function toolCall(id, name, args) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function assistant(content, toolCalls) {
  return { role: 'assistant', content, tool_calls: toolCalls };
}

// `script` entries are assistant messages, or functions (hooks, messages) returning one (or a promise).
function makeHost(script, options = {}) {
  const events = [];
  const seen = [];
  const queue = [...script];
  const host = new AgentHost({
    workspaceRoot: options.workspaceRoot ?? workspace(),
    mode: 'agent',
    modelId: 'test-model',
    emit: (event) => events.push(event),
    complete: async (messages, tools, hooks) => {
      seen.push({ messages: JSON.parse(JSON.stringify(messages)), tools });
      const next = queue.shift();
      if (!next) throw new Error('script exhausted');
      return typeof next === 'function' ? next(hooks, messages) : next;
    },
    ...options,
  });
  return { host, events, seen };
}

async function waitFor(predicate, label = 'condition') {
  for (let i = 0; i < 400; i += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setImmediate(resolve));
    if (i > 50) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function nextApproval(events, skip = 0) {
  return waitFor(() => events.filter((event) => event.type === 'approval_request')[skip], 'approval_request');
}

// Every assistant tool_call must be answered by a tool message, or the next API call is rejected.
function assertToolPairs(messages) {
  const answered = new Set(messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id));
  for (const message of messages) {
    for (const call of message.tool_calls || []) {
      assert.equal(answered.has(call.id), true, `tool call ${call.id} has no tool message`);
    }
  }
}

test('buildLineDiff reports no change for identical or CRLF-only different text', () => {
  assert.deepEqual(buildLineDiff('a\nb\n', 'a\nb\n'), { added: 0, removed: 0, hunks: [], truncated: false });
  const crlf = buildLineDiff('a\r\nb\r\n', 'a\nb\n');
  assert.equal(crlf.added + crlf.removed, 0);
});

test('buildLineDiff marks a created file as all additions with line numbers', () => {
  const diff = buildLineDiff('', 'x\ny\n');
  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 0);
  assert.deepEqual(diff.hunks, [
    { marker: '+', lineNo: 1, code: 'x' },
    { marker: '+', lineNo: 2, code: 'y' },
  ]);
});

test('buildLineDiff shows a replaced line with surrounding context', () => {
  const diff = buildLineDiff('a\nb\nc\n', 'a\nB\nc\n');
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.deepEqual(diff.hunks, [
    { marker: ' ', lineNo: 1, code: 'a' },
    { marker: '-', code: 'b' },
    { marker: '+', lineNo: 2, code: 'B' },
    { marker: ' ', lineNo: 3, code: 'c' },
  ]);
});

test('buildLineDiff degrades to counts for very large inputs instead of hanging', () => {
  const before = Array.from({ length: 3000 }, (_, i) => `old ${i}`).join('\n');
  const after = Array.from({ length: 3000 }, (_, i) => `new ${i}`).join('\n');
  const started = Date.now();
  const diff = buildLineDiff(before, after);
  assert.equal(diff.truncated, true);
  assert.ok(diff.added > 0 && diff.removed > 0);
  assert.ok(Date.now() - started < 2000, 'large diff must stay fast');
});

test('a text-only turn streams tokens, completes, and keeps history across sends', async () => {
  const { host, events, seen } = makeHost([
    (hooks) => {
      hooks.onToken('Hel');
      hooks.onToken('lo');
      return assistant('Hello');
    },
    assistant('Second'),
  ]);

  const first = await host.send('hi');
  assert.deepEqual(first, { status: 'completed', message: 'Hello', limitReached: false });
  assert.deepEqual(events.filter((e) => e.type === 'token').map((e) => e.text), ['Hel', 'lo']);
  assert.equal(events.at(-1).type, 'turn_end');
  assert.equal(events.at(-1).result.status, 'completed');

  await host.send('again');
  const roles = seen[1].messages.map((m) => m.role);
  assert.deepEqual(roles, ['system', 'user', 'assistant', 'user']);
  assert.match(seen[0].messages[0].content, /agent/);
});

test('reasoning tokens are forwarded separately', async () => {
  const { host, events } = makeHost([
    (hooks) => {
      hooks.onReasoning('thinking');
      return assistant('done');
    },
  ]);
  await host.send('go');
  assert.deepEqual(events.filter((e) => e.type === 'reasoning').map((e) => e.text), ['thinking']);
});

test('read tools run without approval and emit tool events', async () => {
  const workspaceRoot = workspace({ 'README.md': 'hello readme' });
  const { host, events, seen } = makeHost([
    assistant('', [toolCall('r1', 'read_file', { path: 'README.md' })]),
    assistant('I read it'),
  ], { workspaceRoot });

  const result = await host.send('read');
  assert.equal(result.status, 'completed');
  assert.equal(events.some((e) => e.type === 'approval_request'), false);

  const agentEvents = events.filter((e) => e.type === 'agent_event').map((e) => e.event);
  assert.deepEqual(agentEvents.map((e) => e.type).filter((t) => t !== 'turn_start' && t !== 'assistant_message'), ['tool_start', 'tool_result', 'turn_complete']);
  const toolMessage = seen[1].messages.find((m) => m.role === 'tool');
  assert.match(toolMessage.content, /hello readme/);
});

test('write_file asks first, shows the diff, and writes only after allow_once', async () => {
  const workspaceRoot = workspace({ 'a.txt': 'a\nb\nc\n' });
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'a\nB\nc\n' })]),
    assistant('Updated'),
  ], { workspaceRoot });

  const turn = host.send('edit');
  const request = (await nextApproval(events)).approval;

  assert.equal(request.kind, 'permission');
  assert.equal(request.toolName, 'write_file');
  assert.equal(request.toolCallId, 'w1');
  assert.equal(request.file.operation, 'overwrite');
  assert.equal(request.file.added, 1);
  assert.equal(request.file.removed, 1);
  assert.equal(request.file.path, 'a.txt');
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'a.txt'), 'utf8'), 'a\nb\nc\n', 'nothing is written before approval');

  assert.equal(host.resolveApproval(request.id, 'allow_once'), true);
  const result = await turn;

  assert.equal(result.status, 'completed');
  assert.equal(result.message, 'Updated');
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'a.txt'), 'utf8'), 'a\nB\nc\n');

  const after = events.slice(events.findIndex((e) => e.type === 'approval_resolved'));
  const toolResult = after.find((e) => e.type === 'agent_event' && e.event.type === 'tool_result');
  assert.equal(toolResult.event.toolCallId, 'w1');
  assert.equal(toolResult.file.operation, 'overwrite', 'the diff is computed before the write, not after');
  assert.ok(after.some((e) => e.type === 'agent_event' && e.event.type === 'turn_complete'));
});

test('creating a file reports a create operation', async () => {
  const workspaceRoot = workspace();
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'new/dir/b.txt', content: 'x\ny\n' })]),
    assistant('ok'),
  ], { workspaceRoot });

  const turn = host.send('create');
  const request = (await nextApproval(events)).approval;
  assert.equal(request.file.operation, 'create');
  assert.equal(request.file.added, 2);
  host.resolveApproval(request.id, 'allow_once');
  await turn;
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'new', 'dir', 'b.txt'), 'utf8'), 'x\ny\n');
});

test('deny ends the turn, writes nothing, and leaves a valid transcript', async () => {
  const workspaceRoot = workspace();
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'x' })]),
  ], { workspaceRoot });

  const turn = host.send('write');
  host.resolveApproval((await nextApproval(events)).approval.id, 'deny');
  const result = await turn;

  assert.equal(result.status, 'denied');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'a.txt')), false);
  assertToolPairs(host.getMessages());
});

test('deny with feedback lets the agent continue and sees the feedback', async () => {
  const workspaceRoot = workspace();
  const { host, events, seen } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'x' })]),
    assistant('Understood, using dashes'),
  ], { workspaceRoot });

  const turn = host.send('write');
  host.resolveApproval((await nextApproval(events)).approval.id, 'deny_feedback', 'use dashes');
  const result = await turn;

  assert.equal(result.status, 'completed');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'a.txt')), false);
  const toolMessage = seen[1].messages.find((m) => m.role === 'tool');
  assert.match(toolMessage.content, /use dashes/);
});

test('cancel answers the pending tool call so the next request stays valid', async () => {
  const workspaceRoot = workspace();
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'x' })]),
    assistant('after cancel'),
  ], { workspaceRoot });

  const turn = host.send('write');
  host.resolveApproval((await nextApproval(events)).approval.id, 'cancel');
  assert.equal((await turn).status, 'cancelled');
  assertToolPairs(host.getMessages());

  const next = await host.send('continue');
  assert.equal(next.status, 'completed');
});

test('allow_session remembers the file so a repeat write does not ask again', async () => {
  const workspaceRoot = workspace();
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'one' })]),
    assistant('', [toolCall('w2', 'write_file', { path: 'a.txt', content: 'two' })]),
    assistant('done'),
  ], { workspaceRoot });

  const turn = host.send('write twice');
  host.resolveApproval((await nextApproval(events)).approval.id, 'allow_session');
  const result = await turn;

  assert.equal(result.status, 'completed');
  assert.equal(events.filter((e) => e.type === 'approval_request').length, 1);
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'a.txt'), 'utf8'), 'two');
});

test('shell commands ask with the command line and run after approval', async () => {
  const { host, events, seen } = makeHost([
    assistant('', [toolCall('s1', 'shell', { command: 'node', args: ['--version'] })]),
    assistant('ran'),
  ]);

  const turn = host.send('version');
  const request = (await nextApproval(events)).approval;
  assert.equal(request.toolName, 'shell');
  assert.equal(request.summary, 'node --version');
  host.resolveApproval(request.id, 'allow_once');

  assert.equal((await turn).status, 'completed');
  assert.match(seen[1].messages.find((m) => m.role === 'tool').content, /v\d+/);
});

test('destructive shell commands carry a warning and can be denied', async () => {
  const { host, events } = makeHost([
    assistant('', [toolCall('s1', 'shell', { command: 'git', args: ['reset', '--hard'] })]),
  ]);

  const turn = host.send('reset');
  const request = (await nextApproval(events)).approval;
  assert.match(request.reason, /destructive/i);
  assert.ok(request.warning);
  host.resolveApproval(request.id, 'deny');
  assert.equal((await turn).status, 'denied');
});

test('paths outside the workspace are denied without ever prompting', async () => {
  const workspaceRoot = workspace();
  const outside = path.join(path.dirname(workspaceRoot), `hi-host-outside-${Date.now()}.txt`);
  const { host, events, seen } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: outside, content: 'nope' })]),
    assistant('could not'),
  ], { workspaceRoot });

  const result = await host.send('escape');
  assert.equal(result.status, 'completed');
  assert.equal(events.some((e) => e.type === 'approval_request'), false);
  assert.equal(fs.existsSync(outside), false);
  assert.match(seen[1].messages.find((m) => m.role === 'tool').content, /denied/i);
});

test('auto accept runs workspace writes without a prompt', async () => {
  const workspaceRoot = workspace();
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'auto.txt', content: 'hi\n' })]),
    assistant('done'),
  ], { workspaceRoot, autoAccept: true });

  assert.equal(host.getMode().permissionMode, 'bypass');
  const result = await host.send('write');
  assert.equal(result.status, 'completed');
  assert.equal(events.some((e) => e.type === 'approval_request'), false);
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'auto.txt'), 'utf8'), 'hi\n');
  const toolResult = events.find((e) => e.type === 'agent_event' && e.event.type === 'tool_result');
  assert.equal(toolResult.file.operation, 'create');
});

test('plan mode asks for plan approval; approving switches to agent and continues', async () => {
  const { host, events, seen } = makeHost([
    assistant('', [toolCall('p1', 'exit_plan_mode', { plan: '1. Do the thing' })]),
    assistant('Implementing'),
  ], { mode: 'plan' });

  assert.deepEqual(host.getMode(), { mode: 'plan', permissionMode: 'plan' });
  const turn = host.send('plan it');
  const request = (await nextApproval(events)).approval;
  assert.equal(request.kind, 'plan');
  assert.match(request.plan, /1\. Do the thing/);

  host.resolveApproval(request.id, 'approve');
  const result = await turn;

  assert.equal(result.status, 'completed');
  assert.equal(result.message, 'Implementing');
  assert.deepEqual(host.getMode(), { mode: 'agent', permissionMode: 'ask' });
  assert.match(seen[1].messages.find((m) => m.role === 'tool').content, /approved/i);
  assert.ok(events.some((e) => e.type === 'mode_changed' && e.mode === 'agent'));
  assert.match(seen[1].messages[0].content, /Current mode: agent/);
});

test('rejecting a plan keeps plan mode and ends the turn cleanly', async () => {
  const { host, events } = makeHost([
    assistant('', [toolCall('p1', 'exit_plan_mode', { plan: '1. Bad plan' })]),
  ], { mode: 'plan' });

  const turn = host.send('plan it');
  host.resolveApproval((await nextApproval(events)).approval.id, 'reject');
  const result = await turn;

  assert.equal(result.status, 'plan_rejected');
  assert.equal(host.getMode().mode, 'plan');
  assertToolPairs(host.getMessages());
});

test('abort cancels a streaming turn and the host stays usable', async () => {
  const { host, seen } = makeHost([
    (hooks) => new Promise((resolve, reject) => {
      hooks.signal.addEventListener('abort', () => {
        const error = new Error('Request cancelled');
        error.name = 'AbortError';
        reject(error);
      });
    }),
    assistant('back again'),
  ]);

  const turn = host.send('long task');
  await waitFor(() => seen.length === 1, 'first completion call');
  host.abort();
  const result = await turn;

  assert.equal(result.status, 'cancelled');
  const next = await host.send('again');
  assert.equal(next.status, 'completed');
  assert.equal(next.message, 'back again');
});

test('abort while waiting for approval cancels and answers the tool call', async () => {
  const workspaceRoot = workspace();
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'x' })]),
  ], { workspaceRoot });

  const turn = host.send('write');
  await nextApproval(events);
  host.abort();
  const result = await turn;

  assert.equal(result.status, 'cancelled');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'a.txt')), false);
  assertToolPairs(host.getMessages());
});

test('a provider error ends the turn with an error result and the host recovers', async () => {
  const { host, events } = makeHost([
    () => { throw new Error('boom'); },
    assistant('fine now'),
  ]);

  const failed = await host.send('x');
  assert.deepEqual(failed, { status: 'error', error: 'boom' });
  assert.equal(events.at(-1).result.status, 'error');
  assert.equal((await host.send('y')).message, 'fine now');
});

test('sending while a turn runs is rejected, and empty messages are refused', async () => {
  const { host, seen } = makeHost([
    (hooks) => new Promise((resolve, reject) => {
      hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    }),
  ]);

  const turn = host.send('first');
  await waitFor(() => seen.length === 1, 'first call');
  await assert.rejects(host.send('second'), /already running/);
  host.abort();
  await turn;
  await assert.rejects(host.send('   '), /empty/i);
});

test('resolveApproval ignores unknown ids and repeats', async () => {
  const workspaceRoot = workspace();
  const { host, events } = makeHost([
    assistant('', [toolCall('w1', 'write_file', { path: 'a.txt', content: 'x' })]),
    assistant('ok'),
  ], { workspaceRoot });

  assert.equal(host.resolveApproval('nope', 'allow_once'), false);
  const turn = host.send('write');
  const id = (await nextApproval(events)).approval.id;
  assert.equal(host.resolveApproval(id, 'allow_once'), true);
  assert.equal(host.resolveApproval(id, 'allow_once'), false);
  await turn;
});

test('maxToolRounds is honored and reported', async () => {
  const workspaceRoot = workspace({ 'a.txt': 'x' });
  const call = () => assistant('', [toolCall(`r${Math.random()}`, 'read_file', { path: 'a.txt' })]);
  const { host, seen } = makeHost([call(), call(), call()], { workspaceRoot, maxToolRounds: 2 });

  const result = await host.send('loop');
  assert.equal(result.status, 'completed');
  assert.equal(result.limitReached, true);
  assert.equal(seen.length, 2);
});

test('tool specs follow the mode and never advertise subagent delegation', async () => {
  const names = (tools) => tools.map((tool) => tool.function.name);

  const agent = makeHost([assistant('a')]);
  await agent.host.send('x');
  assert.ok(names(agent.seen[0].tools).includes('write_file'));
  assert.equal(names(agent.seen[0].tools).includes('task'), false);

  const chat = makeHost([assistant('a')], { mode: 'chat' });
  await chat.host.send('x');
  assert.equal(names(chat.seen[0].tools).includes('write_file'), false);
  assert.equal(names(chat.seen[0].tools).includes('shell'), false);

  const plan = makeHost([assistant('a')], { mode: 'plan' });
  await plan.host.send('x');
  assert.ok(names(plan.seen[0].tools).includes('exit_plan_mode'));
});

test('setMode updates permissions and the system prompt, and is refused mid-turn', async () => {
  const { host, seen } = makeHost([
    assistant('one'),
    (hooks) => new Promise((resolve, reject) => {
      hooks.signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    }),
  ]);

  await host.send('x');
  host.setMode('plan');
  assert.deepEqual(host.getMode(), { mode: 'plan', permissionMode: 'plan' });
  assert.match(host.getMessages()[0].content, /Current mode: plan/);

  const turn = host.send('y');
  await waitFor(() => seen.length === 2, 'second call');
  assert.throws(() => host.setMode('chat'), /running/);
  host.abort();
  await turn;
});

test('reset clears the conversation but keeps the workspace and mode', async () => {
  const { host } = makeHost([assistant('one')]);
  await host.send('x');
  assert.equal(host.getMessages().length, 3);
  host.reset();
  assert.equal(host.getMessages().length, 1);
  assert.equal(host.getMessages()[0].role, 'system');
});
