const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function visibleLength(value) {
  return Array.from(stripAnsi(value)).reduce((sum, char) => sum + (/[\u0080-\uFFFF]/.test(char) ? 2 : 1), 0);
}

test('status header includes project mode model permission and UTF-8 labels', () => {
  const { renderStatusHeader } = require('../dist/chat/ui/layout');
  const raw = renderStatusHeader({
    project: 'My-CLI-很长很长很长很长很长很长',
    mode: 'agent',
    permissionMode: 'ask',
    model: 'glm-4.5-super-long-model-name',
    activeSkills: 2,
    runningSubagents: 1,
  });
  const output = stripAnsi(raw);

  assert.match(output, /0-1 CLI/);
  assert.match(output, /My-CLI/);
  assert.match(output, /agent/);
  assert.match(output, /ask/);
  assert.match(output, /glm-4\.5/);
  assert.match(output, /技能 2/);
  assert.match(output, /子任务 1/);
  for (const line of raw.split('\n').filter(Boolean)) {
    assert.ok(visibleLength(line) <= 66, `line too wide: ${stripAnsi(line)}`);
  }
});

test('permission box renders clear action labels', () => {
  const { renderPermissionBox } = require('../dist/chat/ui/layout');
  const output = stripAnsi(renderPermissionBox({ tool: 'write_file', action: 'ask', reason: 'agent mode requires confirmation' }));

  assert.match(output, /Permission/);
  assert.match(output, /write_file/);
  assert.match(output, /允许/);
  assert.match(output, /拒绝/);
  assert.match(output, /ASK/);
});

test('timeline entries render tool and subagent activity', () => {
  const { renderTimelineEntry } = require('../dist/chat/ui/layout');

  const read = stripAnsi(renderTimelineEntry({ kind: 'tool', status: 'completed', label: 'read_file', detail: 'README.md' }));
  const shell = stripAnsi(renderTimelineEntry({ kind: 'tool', status: 'failed', label: 'shell', detail: 'npm test' }));
  const subagent = stripAnsi(renderTimelineEntry({ kind: 'subagent', status: 'running', label: 'sub-1', detail: 'Review files' }));

  assert.match(read, /read_file/);
  assert.match(read, /completed/);
  assert.match(shell, /shell/);
  assert.match(shell, /failed/);
  assert.match(subagent, /sub-1/);
  assert.match(subagent, /running/);
});

test('timeline truncation does not cut ANSI escape sequences', () => {
  const chalk = require('chalk');
  const previous = chalk.level;
  chalk.level = 1;
  try {
    const { renderTimelineEntry } = require('../dist/chat/ui/layout');
    const output = renderTimelineEntry({
      kind: 'subagent',
      status: 'running',
      label: 'sub-very-long',
      detail: 'x'.repeat(300),
    });

    assert.doesNotMatch(output, /\x1B\[[0-?]*[ -/]*$/);
    assert.match(output, /\x1B\[/);
  } finally {
    chalk.level = previous;
  }
});

test('timeline truncates long wide labels within width', () => {
  const { renderTimelineEntry } = require('../dist/chat/ui/layout');
  const output = renderTimelineEntry({
    kind: 'subagent',
    status: 'running',
    label: '子任务'.repeat(40),
    detail: '审查文件'.repeat(40),
  });

  assert.ok(visibleLength(output) <= 66, `line too wide: ${stripAnsi(output)}`);
  assert.match(stripAnsi(output), /…/);
});

test('timeline truncates long ASCII labels within width', () => {
  const { renderTimelineEntry } = require('../dist/chat/ui/layout');
  const output = renderTimelineEntry({
    kind: 'tool',
    status: 'completed',
    label: 'very-long-ascii-label-that-keeps-going',
    detail: 'ascii-detail-'.repeat(40),
  });

  assert.ok(visibleLength(output) <= 66, `line too wide: ${stripAnsi(output)}`);
  assert.match(stripAnsi(output), /…/);
});

test('permission box formatter is wired into chat runtime', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /formatPermissionDecision/);
  assert.match(source, /subagent runs in/);
});

test('slash menu exposes mode and runtime commands', () => {
  const { formatSlashMenu, getSlashMenuItems } = require('../dist/chat/commands');

  const chatMenu = formatSlashMenu('chat');
  const agentItems = getSlashMenuItems('agent').map((item) => item.command);

  assert.match(chatMenu, /\/chat/);
  assert.match(chatMenu, /\/setting/);
  assert.doesNotMatch(chatMenu, /\/agent spawn <task>/);
  assert.ok(agentItems.includes('/agent spawn <task>'));
  assert.ok(agentItems.includes('/skills'));
});

test('chat runtime wires agent mode through tool-call loop', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /runAgentTurn/);
  assert.match(source, /chatCompleteMessage/);
  assert.match(source, /buildProviderToolSpecs/);
  assert.match(source, /session\.mode === 'agent'/);
});
