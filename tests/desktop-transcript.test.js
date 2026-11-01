const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'cd desktop && npx tsc -p tsconfig.json'], { stdio: 'pipe' });

const t = require('../desktop/dist/renderer/state/transcript');

const base = () => t.createSession({ id: 's1', workspace: 'D:/p', mode: 'agent', permissionMode: 'ask' });
const ev = (event) => ({ sessionId: 's1', event });
const apply = (state, ...events) => events.reduce((acc, event) => t.applyEvent(acc, event), state);
const kinds = (state) => state.items.map((item) => item.kind);

test('a user message starts a turn and names the session from its first line', () => {
  const next = t.addUserMessage(base(), '  请帮我检查 README\n第二行  ');
  assert.equal(next.running, true);
  assert.equal(next.title, '请帮我检查 README');
  assert.deepEqual(kinds(next), ['user']);
  assert.equal(t.addUserMessage(next, 'later').title, '请帮我检查 README');
  assert.equal(t.addUserMessage(base(), 'x'.repeat(200)).title.length <= 41, true);
});

test('streamed tokens grow one assistant item and reasoning stays separate', () => {
  const s = apply(base(),
    ev({ type: 'reasoning', text: 'thinking ' }),
    ev({ type: 'token', text: 'Hel' }),
    ev({ type: 'token', text: 'lo' }),
    ev({ type: 'reasoning', text: 'more' }));
  assert.equal(s.items.length, 1);
  assert.deepEqual({ text: s.items[0].text, reasoning: s.items[0].reasoning, streaming: s.items[0].streaming }, { text: 'Hello', reasoning: 'thinking more', streaming: true });
});

test('assistant_message ends streaming; text after a tool becomes a new assistant item', () => {
  const s = apply(base(),
    ev({ type: 'token', text: 'Reading.' }),
    ev({ type: 'agent_event', event: { type: 'assistant_message', content: 'Reading.', toolCallCount: 1 } }),
    ev({ type: 'agent_event', event: { type: 'tool_start', toolCallId: 'c1', toolName: 'read_file', args: '{"path":"a.txt"}' } }),
    ev({ type: 'token', text: 'Done.' }));
  assert.deepEqual(kinds(s), ['assistant', 'tool', 'assistant']);
  assert.equal(s.items[0].streaming, false);
  assert.equal(s.items[2].streaming, true);
  assert.equal(s.items[1].summary, 'a.txt');
  assert.equal(s.items[1].status, 'running');
});

test('tool results update the matching tool and attach file changes only when allowed', () => {
  const file = { path: 'a.txt', operation: 'overwrite', added: 1, removed: 1, hunks: [], truncated: false };
  const start = (id) => ev({ type: 'agent_event', event: { type: 'tool_start', toolCallId: id, toolName: 'write_file', args: '{"path":"a.txt","content":"x"}' } });
  const s = apply(base(), start('c1'), start('c2'),
    ev({ type: 'agent_event', event: { type: 'tool_result', toolCallId: 'c1', toolName: 'write_file', permissionDecision: 'allow', contentPreview: 'OK' }, file }),
    ev({ type: 'agent_event', event: { type: 'tool_result', toolCallId: 'c2', toolName: 'write_file', permissionDecision: 'deny', contentPreview: 'Tool denied' } }));
  assert.deepEqual(s.items.map((item) => item.status), ['done', 'denied']);
  assert.deepEqual(s.items[0].file, file);
  assert.equal(s.items[1].file, undefined);
  assert.equal(s.items[0].preview, 'OK');
});

test('an approval request waits on its tool and resolving it resumes or closes the tool', () => {
  const approval = { id: 'a1', kind: 'permission', toolCallId: 'c1', toolName: 'shell', reason: 'needs confirmation', summary: 'node --version' };
  const started = apply(base(), ev({ type: 'agent_event', event: { type: 'tool_start', toolCallId: 'c1', toolName: 'shell', args: '{"command":"node","args":["--version"]}' } }));
  assert.equal(started.items[0].summary, 'node --version');

  const waiting = apply(started, ev({ type: 'approval_request', approval }));
  assert.equal(waiting.items[0].status, 'waiting');
  assert.equal(t.pendingApproval(waiting).approval.id, 'a1');

  const allowed = apply(waiting, ev({ type: 'approval_resolved', id: 'a1', answer: 'allow_once' }));
  assert.equal(t.pendingApproval(allowed), undefined);
  assert.equal(allowed.items[0].status, 'running');
  assert.equal(allowed.items[1].answer, 'allow_once');

  const denied = apply(waiting, ev({ type: 'approval_resolved', id: 'a1', answer: 'deny' }));
  assert.equal(denied.items[0].status, 'denied');
});

test('turn_end stops the turn, closes dangling work and reports the outcome', () => {
  const running = apply(t.addUserMessage(base(), 'go'),
    ev({ type: 'token', text: 'partial' }),
    ev({ type: 'agent_event', event: { type: 'tool_start', toolCallId: 'c1', toolName: 'read_file', args: '{}' } }));
  const end = (result) => apply(running, ev({ type: 'turn_end', result }));

  const done = end({ status: 'completed', message: 'ok', limitReached: false });
  assert.equal(done.running, false);
  assert.equal(done.items.every((item) => item.kind !== 'assistant' || !item.streaming), true);
  assert.equal(done.items.find((item) => item.kind === 'tool').status, 'error');

  assert.deepEqual(end({ status: 'error', error: 'boom' }).items.at(-1), { kind: 'notice', id: end({ status: 'error', error: 'boom' }).items.at(-1).id, tone: 'error', text: 'boom' });
  assert.equal(end({ status: 'cancelled' }).items.at(-1).tone, 'info');
  assert.equal(end({ status: 'completed', message: 'x', limitReached: true }).items.at(-1).tone, 'warn');
  assert.equal(end({ status: 'denied' }).items.at(-1).kind, 'notice');
});

test('mode changes, unknown events and bad input never break the state', () => {
  const s = apply(base(), ev({ type: 'mode_changed', mode: 'plan', permissionMode: 'plan' }));
  assert.deepEqual([s.mode, s.permissionMode], ['plan', 'plan']);
  assert.equal(apply(base(), ev({ type: 'something_new' }), ev(null), { sessionId: 's1' }).items.length, 0);
});

test('the reducer never mutates the state it receives', () => {
  const before = apply(base(), ev({ type: 'token', text: 'a' }));
  const frozen = JSON.stringify(before);
  apply(before, ev({ type: 'token', text: 'b' }), ev({ type: 'turn_end', result: { status: 'cancelled' } }));
  assert.equal(JSON.stringify(before), frozen);
});

test('summarizeArgs shows the path, command line or nothing', () => {
  assert.equal(t.summarizeArgs('read_file', '{"path":"src/a.ts"}'), 'src/a.ts');
  assert.equal(t.summarizeArgs('shell', '{"command":"npm","args":["run","build"]}'), 'npm run build');
  assert.equal(t.summarizeArgs('list_files', '{}'), '');
  assert.equal(t.summarizeArgs('shell', 'not json'), '');
  assert.equal(t.summarizeArgs('shell', undefined), '');
});
