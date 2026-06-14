const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function trySymlinkDir(target, link) {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}

test('tool registry includes metadata and mode restrictions', () => {
  const { getToolDefinition } = require('../dist/chat/tools/registry');

  const read = getToolDefinition('read_file');
  const shell = getToolDefinition('shell');

  assert.equal(read.kind, 'read');
  assert.deepEqual(read.allowedModes, ['chat', 'agent', 'plan']);
  assert.equal(shell.kind, 'shell');
  assert.deepEqual(shell.allowedModes, ['agent']);
});

test('readFileTool truncates large UTF-8 files', () => {
  const { readFileTool } = require('../dist/chat/tools/fs-read');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-read-'));
  const file = path.join(dir, '中文.txt');
  fs.writeFileSync(file, Array.from({ length: 220 }, (_, i) => `第${i}行`).join('\n'), 'utf8');

  const result = readFileTool({ path: file, workspaceRoot: dir, maxLines: 200 });

  assert.match(result, /第0行/);
  assert.match(result, /第199行/);
  assert.doesNotMatch(result, /第219行/);
  assert.match(result, /truncated/);
});

test('readFileTool denies paths outside workspace', () => {
  const { readFileTool } = require('../dist/chat/tools/fs-read');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-read-'));
  const outside = path.join(os.tmpdir(), 'outside-hi-read.txt');
  fs.writeFileSync(outside, 'secret', 'utf8');

  const result = readFileTool({ path: outside, workspaceRoot: dir });

  assert.match(result, /outside workspace/i);
});

test('searchFilesTool does not execute shell metacharacters', () => {
  const { searchFilesTool } = require('../dist/chat/tools/fs-read');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-search-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'alpha\nbeta\n', 'utf8');

  const result = searchFilesTool({ pattern: 'alpha; echo hacked', workspaceRoot: dir });

  assert.equal(result, '(no matches)');
  assert.doesNotMatch(result, /hacked/);
});

test('searchFilesTool supports explicit file targets', () => {
  const { searchFilesTool } = require('../dist/chat/tools/fs-read');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-search-file-'));
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'alpha\nbeta\n', 'utf8');

  const result = searchFilesTool({ pattern: 'beta', path: file, workspaceRoot: dir });

  assert.match(result, /a\.txt:2: beta/);
});

test('searchFilesTool skips linked files outside workspace', (t) => {
  const { searchFilesTool } = require('../dist/chat/tools/fs-read');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-search-link-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-search-outside-'));
  const outsideFile = path.join(outside, 'secret.txt');
  const link = path.join(dir, 'linked-secret.txt');
  fs.writeFileSync(outsideFile, 'needle-from-outside\n', 'utf8');
  try {
    fs.symlinkSync(outsideFile, link, 'file');
  } catch {
    t.skip('file links are not available');
  }

  const result = searchFilesTool({ pattern: 'needle-from-outside', workspaceRoot: dir });

  assert.equal(result, '(no matches)');
});

test('searchFilesTool skips linked directories outside workspace', (t) => {
  const { searchFilesTool } = require('../dist/chat/tools/fs-read');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-search-dirlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-search-diroutside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'needle-from-linked-dir\n', 'utf8');
  const link = path.join(dir, 'linked');
  if (!trySymlinkDir(outside, link)) t.skip('directory links are not available');

  const result = searchFilesTool({ pattern: 'needle-from-linked-dir', workspaceRoot: dir });

  assert.equal(result, '(no matches)');
});

test('writeFileTool requires an allow decision and resolves relative paths inside workspace', () => {
  const { writeFileTool } = require('../dist/chat/tools/fs-write');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-write-'));

  assert.match(writeFileTool({ path: 'out.txt', content: 'no', workspaceRoot: dir }), /permission/i);

  const result = writeFileTool({
    path: 'nested/out.txt',
    content: 'hello',
    workspaceRoot: dir,
    permissionDecision: { decision: 'allow', reason: 'test' },
  });

  assert.equal(result, 'OK');
  assert.equal(fs.readFileSync(path.join(dir, 'nested', 'out.txt'), 'utf8'), 'hello');
  assert.equal(fs.existsSync(path.join(process.cwd(), 'nested', 'out.txt')), false);
});

test('writeFileTool denies writes through linked directories outside workspace', (t) => {
  const { writeFileTool } = require('../dist/chat/tools/fs-write');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-write-link-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-write-outside-'));
  const link = path.join(dir, 'linked');
  if (!trySymlinkDir(outside, link)) t.skip('directory links are not available');

  const result = writeFileTool({
    path: 'linked/out.txt',
    content: 'secret',
    workspaceRoot: dir,
    permissionDecision: { decision: 'allow', reason: 'test' },
  });

  assert.match(result, /outside workspace/i);
  assert.equal(fs.existsSync(path.join(outside, 'out.txt')), false);
});

test('runShellTool requires permission and workspace cwd', async () => {
  const { runShellTool } = require('../dist/chat/tools/shell');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-shell-'));

  assert.match(await runShellTool({ command: 'node', args: ['--version'], cwd: dir, workspaceRoot: dir }), /permission/i);
  assert.match(await runShellTool({
    command: 'node',
    args: ['--version'],
    cwd: os.tmpdir(),
    workspaceRoot: dir,
    permissionDecision: { decision: 'allow', reason: 'test' },
  }), /outside workspace/i);
});

test('runShellTool denies linked cwd outside workspace', async (t) => {
  const { runShellTool } = require('../dist/chat/tools/shell');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-shell-link-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-shell-outside-'));
  const link = path.join(dir, 'linked');
  if (!trySymlinkDir(outside, link)) t.skip('directory links are not available');

  const result = await runShellTool({
    command: 'node',
    args: ['--version'],
    cwd: 'linked',
    workspaceRoot: dir,
    permissionDecision: { decision: 'allow', reason: 'test' },
  });

  assert.match(result, /outside workspace/i);
});

test('computeFileChangeSummary returns create label for new files', () => {
  const { computeFileChangeSummary } = require('../dist/chat/tools/fs-write');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-diff-create-'));

  const summary = computeFileChangeSummary({
    targetPath: path.join(dir, 'new.txt'),
    newContent: 'line1\nline2\nline3\n',
    workspaceRoot: dir,
  });

  assert.equal(summary.operation, 'create');
  assert.equal(summary.added, 4);
  assert.equal(summary.removed, 0);
  assert.equal(summary.changed, 0);
});

test('computeFileChangeSummary returns overwrite label for existing files', () => {
  const { computeFileChangeSummary } = require('../dist/chat/tools/fs-write');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-diff-overwrite-'));
  const file = path.join(dir, 'existing.txt');
  fs.writeFileSync(file, 'old line1\nold line2\n', 'utf8');

  const summary = computeFileChangeSummary({
    targetPath: file,
    newContent: 'new line1\nnew line2\nnew line3\n',
    workspaceRoot: dir,
  });

  assert.equal(summary.operation, 'overwrite');
  assert.ok(summary.added + summary.removed + summary.changed > 0);
});

test('computeFileChangeSummary preserves UTF-8 content in summary', () => {
  const { computeFileChangeSummary } = require('../dist/chat/tools/fs-write');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-diff-utf8-'));
  const file = path.join(dir, '中文文件.txt');
  fs.writeFileSync(file, '原始内容\n第二行\n', 'utf8');

  const summary = computeFileChangeSummary({
    targetPath: file,
    newContent: '修改内容\n第二行\n新增行\n',
    workspaceRoot: dir,
  });

  assert.equal(summary.operation, 'overwrite');
  assert.ok(summary.added >= 1);
  assert.ok(summary.removed >= 0);
  assert.doesNotMatch(JSON.stringify(summary), /\ufffd/);
});

test('rejected write_file leaves file unchanged when permission denied', async () => {
  const { executeToolCall } = require('../dist/chat/tools/runner');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-deny-write-'));
  const file = path.join(dir, 'keep.txt');
  fs.writeFileSync(file, 'original 中文', 'utf8');

  const result = await executeToolCall({
    toolCall: {
      id: 'deny-test',
      type: 'function',
      function: { name: 'write_file', arguments: JSON.stringify({ path: 'keep.txt', content: 'overwritten' }) },
    },
    mode: 'agent',
    permissionMode: 'ask',
    workspaceRoot: dir,
  });

  assert.equal(result.permissionRequired, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'original 中文');
});

test('legacy executeTool uses safe read implementation', async () => {
  const { executeTool } = require('../dist/chat/tools');
  const originalCwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-legacy-'));
  try {
    process.chdir(dir);
    fs.writeFileSync(path.join(dir, 'file.txt'), 'hello UTF-8 中文', 'utf8');

    const result = await executeTool('read file.txt');

    assert.match(result, /hello UTF-8 中文/);
  } finally {
    process.chdir(originalCwd);
  }
});
