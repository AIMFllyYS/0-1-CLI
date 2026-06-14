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

const REPLACEMENT = '\uFFFD';
const MOJIBAKE_FRAGMENTS = /鏃|璇|鎶|瀛|鈥|鈼/;

function assertNoMojibake(text, label) {
  const plain = stripAnsi(text);
  assert.ok(!plain.includes(REPLACEMENT), `${label} contains replacement char U+FFFD`);
  assert.doesNotMatch(plain, MOJIBAKE_FRAGMENTS, `${label} contains mojibake fragment`);
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
  assert.match(output, /\[A Agent\]/);
  assert.match(output, /asks before tools/);
  assert.match(output, /glm-4\.5/);
  assert.match(output, /技能 2/);
  assert.match(output, /子任务 1/);
  assertNoMojibake(raw, 'status header');
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
  assertNoMojibake(output, 'permission box');
});

test('plan approval panel renders Claude-style ready-to-code review', () => {
  const { renderPlanApprovalPanel } = require('../dist/chat/ui/layout');
  const output = stripAnsi(renderPlanApprovalPanel({
    plan: 'Goal: 保留 UTF-8 中文\nSteps:\n- implement safely',
    planFilePath: 'D:\\workspace\\.0-1-cli\\plans\\current.md',
    permissions: [{ action: 'edit files', reason: 'implement plan' }],
  }));

  assert.match(output, /Ready to code\?/);
  assert.match(output, /Here is 0-1 CLI's plan:/);
  assert.match(output, /Goal: 保留 UTF-8 中文/);
  assert.match(output, /Requested permissions:/);
  assert.match(output, /edit files: implement plan/);
  assert.match(output, /Yes, manually approve edits/);
  assert.match(output, /No, keep planning/);
  assert.match(output, /Plan file:/);
  assert.match(output, /not auto-granted/i);
  assertNoMojibake(output, 'plan approval panel');
});

test('plan approval panel keeps wide plan content within status width', () => {
  const { renderPlanApprovalPanel } = require('../dist/chat/ui/layout');
  const raw = renderPlanApprovalPanel({
    plan: `Goal: ${'保留中文'.repeat(30)}\nSteps:\n- ${'verify '.repeat(40)}`,
    permissions: [{ action: 'edit files' }],
  });

  for (const line of raw.split('\n').filter(Boolean)) {
    assert.ok(visibleLength(line) <= 66, `line too wide: ${stripAnsi(line)}`);
  }
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
  assert.match(source, /renderPlanApprovalPanel/);
  assert.match(source, /subagent runs in/);
});

test('mode pill renders all modes without exceeding status width', () => {
  const { renderModePill } = require('../dist/chat/ui/layout');

  for (const mode of ['chat', 'agent', 'plan']) {
    const output = renderModePill(mode, mode === 'agent' ? 'ask' : mode === 'plan' ? 'plan' : 'ask');
    const plain = stripAnsi(output);
    assert.match(plain, /^\[[CAP] /);
    assert.ok(visibleLength(output) <= 28, `mode pill too wide: ${plain}`);
  }
});

test('slash menu exposes mode and runtime commands with Skills group', () => {
  const { formatSlashMenu, getSlashMenuItems } = require('../dist/chat/commands');

  const chatMenu = formatSlashMenu('chat');
  const agentMenu = formatSlashMenu('agent');
  const agentItems = getSlashMenuItems('agent').map((item) => item.command);

  assert.match(chatMenu, /\/chat/);
  assert.match(chatMenu, /\/plan open/);
  assert.match(chatMenu, /\/setting/);
  assert.doesNotMatch(chatMenu, /\/agent spawn <task>/);
  assert.ok(agentItems.includes('/agent spawn <task>'));
  assert.ok(agentItems.includes('/skills'));
  assert.match(agentMenu, /Skills/);
  assert.match(agentMenu, /\/skills/);
  assert.match(agentMenu, /\/skill <id\|name>/);
});

test('slash menu groups commands with Claude-style source metadata and Skills category', () => {
  const {
    formatDescriptionWithSource,
    formatSlashMenu,
    getSlashCommandDefinitions,
  } = require('../dist/chat/commands');

  const menu = formatSlashMenu('agent');
  const definitions = getSlashCommandDefinitions('agent');
  const spawn = definitions.find((item) => item.command === '/agent spawn <task>');
  const skill = definitions.find((item) => item.command === '/skill <id|name>');
  const skills = definitions.find((item) => item.command === '/skills');

  assert.match(menu, /Mode/);
  assert.match(menu, /Agent/);
  assert.match(menu, /Runtime/);
  assert.match(menu, /Skills/);
  assert.match(menu, /\[builtin\]/);
  assert.equal(spawn.category, 'Agent');
  assert.equal(spawn.loadedFrom, 'builtin');
  assert.equal(spawn.argumentHint, '<task>');
  assert.equal(skill.category, 'Skills');
  assert.equal(skills.category, 'Skills');
  assert.equal(formatDescriptionWithSource(spawn), 'Start a scoped local subagent [builtin]');
});

test('slash command registry supports aliases arguments and hidden filtering', () => {
  const {
    getSlashCommandDefinitions,
    parseSlashCommand,
    resolveSlashCommand,
  } = require('../dist/chat/commands');

  const definitions = getSlashCommandDefinitions('agent');
  const help = definitions.find((item) => item.command === '/help');
  const exit = definitions.find((item) => item.command === '/exit');
  const setting = definitions.find((item) => item.command === '/setting');
  const hidden = definitions.filter((item) => item.isHidden);

  assert.deepEqual(resolveSlashCommand('/h'), { command: '/help', args: '', rawCommand: '/h' });
  assert.deepEqual(resolveSlashCommand('/settings'), { command: '/setting', args: '', rawCommand: '/settings' });
  assert.deepEqual(resolveSlashCommand('/m glm-4.5'), { command: '/model', args: 'glm-4.5', rawCommand: '/m' });
  assert.equal(resolveSlashCommand('/missing'), null);
  assert.deepEqual(parseSlashCommand('/missing value'), { command: '/missing', args: 'value' });
  assert.ok(help.aliases.includes('/h'));
  assert.ok(exit.aliases.includes('/q'));
  assert.equal(setting.argumentHint, 'URL / API Key / Model IDs');
  assert.equal(hidden.length, 0);
});

test('chat runtime wires agent mode through tool-call loop', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /runAgentTurn/);
  assert.match(source, /chatCompleteMessage/);
  assert.match(source, /buildProviderToolSpecs\(session\.mode\)/);
  assert.match(source, /session\.mode === 'agent'/);
});

test('chat runtime wires permission dialog choices into agent ask mode', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /formatPermissionPromptOptions/);
  assert.match(source, /parsePermissionPromptChoice/);
  assert.match(source, /applyPermissionPromptChoice/);
  assert.match(source, /permissionSession/);
  assert.match(source, /askLine/);
});

test('chat runtime wires mode-cycle shortcuts into the keypress handler', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /getNextMode/);
  assert.match(source, /cycleMode/);
  assert.match(source, /shift/);
  assert.match(source, /meta/);
});

test('keyboard hint row renders navigational shortcuts without exceeding status width', () => {
  const { renderKeyboardHintRow } = require('../dist/chat/ui/layout');

  const output = stripAnsi(renderKeyboardHintRow());

  assert.match(output, /Esc/);
  assert.match(output, /Tab/);
  assert.match(output, /Enter/);
  assert.match(output, /navigate/);
  assert.ok(visibleLength(output) <= 66, `hint row too wide: ${output}`);
});
