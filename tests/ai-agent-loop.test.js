const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('agent loop executes tool calls and continues to final assistant message', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-'));
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'agent saw UTF-8 Chinese 中文', 'utf8');

  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'read note.txt' },
  ];
  const seenMessageCounts = [];
  const result = await runAgentTurn({
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'bypass',
    complete: async (nextMessages) => {
      seenMessageCounts.push(nextMessages.length);
      if (seenMessageCounts.length === 1) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'read_file', arguments: JSON.stringify({ path: 'note.txt' }) },
          }],
        };
      }
      assert.equal(nextMessages.at(-1).role, 'tool');
      assert.match(nextMessages.at(-1).content, /agent saw UTF-8 Chinese 中文/);
      return { role: 'assistant', content: 'The file says 中文.' };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.finalMessage.content, 'The file says 中文.');
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.toolResults[0].message.tool_call_id, 'call-1');
  assert.deepEqual(seenMessageCounts, [2, 4]);
  assert.equal(messages.at(-1).content, 'The file says 中文.');
});

test('agent loop stops before executing ask-permission tools', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-ask-'));

  const result = await runAgentTurn({
    messages: [{ role: 'user', content: 'write a file' }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    complete: async () => ({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-write',
        type: 'function',
        function: { name: 'write_file', arguments: JSON.stringify({ path: 'out.txt', content: 'no' }) },
      }],
    }),
  });

  assert.equal(result.status, 'permission_required');
  assert.equal(result.pendingToolCall.id, 'call-write');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'out.txt')), false);
});
