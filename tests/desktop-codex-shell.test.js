const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(...file.split('/')), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(...file.split('/')));
}

test('desktop renderer is split into codex shell modules instead of a monolithic App', () => {
  const expected = [
    'desktop/src/renderer/codex-shell/CodexShell.tsx',
    'desktop/src/renderer/codex-shell/SessionRail.tsx',
    'desktop/src/renderer/codex-shell/ConversationView.tsx',
    'desktop/src/renderer/codex-shell/MessageList.tsx',
    'desktop/src/renderer/codex-shell/Composer.tsx',
    'desktop/src/renderer/codex-shell/ActivityStrip.tsx',
    'desktop/src/renderer/codex-shell/useConversationState.ts',
    'desktop/src/renderer/codex-shell/types.ts',
  ];

  expected.forEach((file) => assert.equal(exists(file), true, `${file} missing`));

  const app = read('desktop/src/renderer/App.tsx');
  assert.match(app, /CodexShell/);
  assert.ok(app.split(/\r?\n/).length < 40, 'App.tsx should stay as a thin mount file');
  assert.doesNotMatch(app, /desktopActions|InstallPanel|ClearPanel|SettingsPanel/);

  const shell = read('desktop/src/renderer/codex-shell/CodexShell.tsx');
  assert.ok(shell.split(/\r?\n/).length < 90, 'CodexShell.tsx should stay as a thin composition file');
  assert.doesNotMatch(shell, /InspectorPane|useInspectorState|listInstallTargets|scanClearProcesses|getLatestRelease|sendAiMessage/);
});

test('desktop shell includes multi-session rail, rich conversation area, and codex-like composer hooks', () => {
  const shell = read('desktop/src/renderer/codex-shell/CodexShell.tsx');
  const conversation = read('desktop/src/renderer/codex-shell/ConversationView.tsx');
  const composer = read('desktop/src/renderer/codex-shell/Composer.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  assert.match(shell, /SessionRail/);
  assert.match(shell, /ConversationView/);
  assert.doesNotMatch(shell, /InspectorPane|useInspectorState/);
  assert.match(conversation, /MessageList/);
  assert.match(conversation, /ActivityStrip/);
  assert.match(composer, /textarea/);
  assert.match(composer, /onSend/);
  assert.match(styles, /\.codexShell/);
  assert.match(styles, /\.sessionRail/);
  assert.match(styles, /\.messageList/);
  assert.match(styles, /\.composerTextarea/);
  assert.match(styles, /grid-template-columns:\s*280px minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(styles, /\.inspectorPane|\.outputPanel|grid-template-columns:\s*248px minmax\(520px,\s*1fr\) 356px/);
  assert.doesNotMatch(styles, /background-size:\s*28px 28px/);
});

test('desktop renderer omits automation and native action inspector from the primary shell', () => {
  const shell = read('desktop/src/renderer/codex-shell/CodexShell.tsx');
  const conversationState = read('desktop/src/renderer/codex-shell/useConversationState.ts');
  const styles = read('desktop/src/renderer/styles.css');

  assert.doesNotMatch(shell, /InspectorPane|useInspectorState/);
  assert.doesNotMatch(styles, /\.inspectorPane|\.outputPanel|\.commandCard|\.releaseAsset/);
  assert.doesNotMatch(shell + conversationState + styles, /automation|plugins|release controls|downloadable assets|Desktop release|Settings/i);
});

test('desktop message list renders a bounded recent window for smoother long chats', () => {
  const messageList = read('desktop/src/renderer/codex-shell/MessageList.tsx');

  assert.match(messageList, /VISIBLE_MESSAGE_LIMIT\s*=\s*80/);
  assert.match(messageList, /props\.messages\.slice\(-VISIBLE_MESSAGE_LIMIT\)/);
  assert.match(messageList, /React\.memo/);
});

test('desktop exposes embedded ai message ipc without raw renderer shell access', () => {
  const main = read('desktop/src/main/main.ts');
  const preload = read('desktop/src/preload/index.ts');
  const aiSession = read('desktop/src/main/ai-session.ts');

  assert.match(main, /ai:message/);
  assert.match(preload, /sendAiMessage/);
  assert.match(aiSession, /sendDesktopAiMessage/);
  assert.match(aiSession, /runAgentTurn|chatCompleteMessage/);
  assert.match(aiSession, /buildSystemPrompt/);
  assert.match(aiSession, /systemPrompt/);
  assert.doesNotMatch(preload, /sendAiMessage[\s\S]*validateDesktopCommand/);
  assert.doesNotMatch(aiSession, /shell:\s*true/);
});

test('desktop ai session owns conversation history and maps agent events to activity', () => {
  const aiSession = read('desktop/src/main/ai-session.ts');
  const conversationState = read('desktop/src/renderer/codex-shell/useConversationState.ts');

  assert.match(aiSession, /desktopAiSessions\s*=\s*new Map/);
  assert.match(aiSession, /getDesktopAiSession/);
  assert.match(aiSession, /appendDesktopUserMessage/);
  assert.match(aiSession, /onEvent:\s*\(event\)/);
  assert.match(aiSession, /activityFromAgentEvents/);
  assert.match(aiSession, /session\.messages/);
  assert.match(aiSession, /session\.activity/);
  assert.doesNotMatch(aiSession, /const turnMessages:[\s\S]*safeMessages\(request\.messages, request\.text\)/);
  assert.doesNotMatch(conversationState, /messages:\s*\[\.\.\.messages/);
});
