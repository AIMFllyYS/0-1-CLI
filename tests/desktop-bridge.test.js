const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent && cd desktop && npx tsc -p tsconfig.json'], { stdio: 'pipe' });

const read = (file) => fs.readFileSync(path.join(...file.split('/')), 'utf8');
const quoted = (source) => [...source.matchAll(/'([A-Za-z-]+:[A-Za-z]+)'/g)].map((match) => match[1]);

test('the preload is self-contained: it requires only electron', () => {
  const compiled = read('desktop/dist/preload/index.js');
  const requires = [...compiled.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.deepEqual(requires, ['electron'], 'a sandboxed preload cannot load local modules, which is what broke the old desktop');
});

test('preload, shared channel list and the main-process handlers all agree', () => {
  const { DESKTOP_CHANNELS } = require('../dist/desktop/api');
  const toolChannels = quoted(read('desktop/src/main/tools-ipc.ts').match(/TOOL_CHANNELS = \[([\s\S]*?)\] as const/)[1]);
  const preloadChannels = quoted(read('desktop/src/preload/index.ts').match(/new Set<string>\(\[([\s\S]*?)\]\)/)[1]);
  const sharedChannels = quoted(read('desktop/src/shared/channels.ts').match(/REQUEST_CHANNELS = \[([\s\S]*?)\] as const/)[1]);

  assert.deepEqual([...sharedChannels].sort(), [...DESKTOP_CHANNELS].sort(), 'shared list must equal the api list');
  assert.deepEqual([...preloadChannels].sort(), [...DESKTOP_CHANNELS, ...toolChannels].sort());
  assert.equal(new Set(preloadChannels).size, preloadChannels.length);
});

test('every channel the renderer can call is registered in the main process, and nothing else is', () => {
  const main = read('desktop/src/main/main.ts');
  const tools = read('desktop/src/main/tools-ipc.ts');
  assert.match(main, /for \(const channel of REQUEST_CHANNELS\)/);
  assert.match(main, /ipcMain\.handle\(channel/);
  assert.match(main, /registerToolChannels\(\)/);
  assert.match(tools, /for the channels in TOOL_CHANNELS|const handle = \(channel: \(typeof TOOL_CHANNELS\)\[number\]/);
  const registered = [...tools.matchAll(/handle\('([^']+)'/g)].map((match) => match[1]);
  const declared = quoted(tools.match(/TOOL_CHANNELS = \[([\s\S]*?)\] as const/)[1]);
  assert.deepEqual(registered.sort(), declared.sort());
});

test('every ipc handler checks that the sender is the app page', () => {
  const main = read('desktop/src/main/main.ts');
  const tools = read('desktop/src/main/tools-ipc.ts');
  assert.match(main, /isTrustedSender\(event\.senderFrame\?\.url/);
  assert.match(tools, /isTrustedSender\(event\.senderFrame\?\.url/);
  assert.equal((tools.match(/ipcMain\.handle/g) || []).length, 1, 'all tool channels go through the one checked wrapper');
  assert.equal((main.match(/ipcMain\.handle/g) || []).length, 1, 'all api channels go through the one checked wrapper');
});

test('trust rules accept the packaged page and localhost only', () => {
  const { isTrustedSender, isAllowedRendererUrl } = require('../desktop/dist/main/trust');
  assert.equal(isTrustedSender('file:///C:/app/index.html'), true);
  assert.equal(isTrustedSender('http://127.0.0.1:5173/'), true);
  assert.equal(isTrustedSender('http://localhost:5173/x'), true);
  for (const bad of ['https://evil.example.com/', 'http://127.0.0.1.evil.com/', 'http://localhost.evil.com/', 'about:blank', '', 'javascript:alert(1)', 'data:text/html,x']) {
    assert.equal(isTrustedSender(bad), false, bad);
  }
  assert.equal(isAllowedRendererUrl('not a url'), false);
});

test('the window is sandboxed, isolated, and cannot be navigated away or used to open arbitrary windows', () => {
  const main = read('desktop/src/main/main.ts');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /action:\s*'deny'/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /requestSingleInstanceLock/);
  assert.doesNotMatch(main, /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/);
});

test('external links only open over https', () => {
  const main = read('desktop/src/main/main.ts');
  assert.match(main, /\/\^https:\\\/\\\//);
});

test('the renderer bridge has no generic shell, spawn or file channel', () => {
  const all = [...quoted(read('desktop/src/preload/index.ts'))];
  for (const channel of all) assert.doesNotMatch(channel, /exec|shell|spawn|fs:|readFile|writeFile|eval/i, channel);
  const preload = read('desktop/src/preload/index.ts');
  assert.doesNotMatch(preload, /child_process|from 'fs'|require\('fs'\)/);
  assert.doesNotMatch(preload, /exposeInMainWorld\('zeroOneCli',\s*ipcRenderer/);
});

test('the dashboard command whitelist still blocks interactive and arbitrary commands', () => {
  const { validateDesktopCommand } = require('../desktop/dist/main/permissions');
  for (const ok of ['state', 'hi --api', '--pay', 'help']) assert.equal(validateDesktopCommand(ok).allowed, true, ok);
  for (const bad of ['install', 'skills', 'clear', 'ai', 'guide', 'rm -rf /', 'config set ai.autoAccept true', 'path add C:/x', 'run demo', '']) {
    assert.equal(validateDesktopCommand(bad).allowed, false, bad);
  }
});

test('destructive native actions still require an explicit confirm flag', async () => {
  const { killDesktopClearProcesses } = require('../desktop/dist/main/clear-actions');
  const unconfirmed = await killDesktopClearProcesses({ pids: [999999] });
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.requiresConfirmation, true);
  assert.equal((await killDesktopClearProcesses({ pids: [999999], confirm: 'yes' })).requiresConfirmation, true);
  assert.equal((await killDesktopClearProcesses({ pids: [], confirm: true })).ok, false);
});

test('release asset downloads are limited to assets of the latest release', () => {
  const tools = read('desktop/src/main/tools-ipc.ts');
  assert.match(tools, /isAllowedReleaseAssetUrl\(releaseAssetUrls, url\)/);
  assert.match(tools, /rememberReleaseAssetUrls\(releaseAssetUrls, release\)/);
  assert.match(read('desktop/src/main/github-release.ts'), /api\.github\.com\/repos\/AIMFllyYS\/0-1-CLI\/releases\/latest/);
  assert.doesNotMatch(read('desktop/src/main/github-release.ts'), /ghp_[A-Za-z0-9_]+|GITHUB_PERSONAL_ACCESS_TOKEN\s*=/);
});

test('the main process keeps credentials out of anything it sends to the window', () => {
  const main = read('desktop/src/main/main.ts');
  const api = read('src/desktop/api.ts');
  assert.doesNotMatch(main, /apiKey|AI_API_KEY/);
  assert.match(api, /describeProvider\(\)/);
  assert.doesNotMatch(api, /provider: loadProvider|apiKey: .*loadProvider/);
});

test('autostart is refused for an unpackaged build so it can never register the bare electron binary', () => {
  const main = read('desktop/src/main/main.ts');
  assert.match(main, /if \(!app\.isPackaged\)/);
  assert.match(main, /setLoginItemSettings\(\{ openAtLogin: enabled/);
});

test('the packaged app ships the runtime modules the main process loads', () => {
  const main = read('desktop/src/main/main.ts');
  const modules = [['desktop', 'api.js'], ['modules', 'launch', 'terminal.js'], ['settings', 'provider.js']];
  for (const parts of modules) {
    const loaded = parts.map((part) => `'${part}'`).join(', ');
    assert.ok(main.includes(`resolveRuntimeRoot(), ${loaded}`), `main.ts must load ${parts.join('/')}`);
    assert.equal(fs.existsSync(path.join('dist', ...parts)), true, `${parts.join('/')} must exist in the CLI build that gets copied into the app`);
  }
});

test('desktop exposes embedded ai message ipc without raw renderer shell access', () => {
  const api = read('src/desktop/api.ts');
  const preload = read('desktop/src/preload/index.ts');
  const host = read('src/chat/agent/host.ts');

  assert.match(preload, /'ai:send'/);
  assert.match(api, /'ai:send'/);
  assert.match(host, /buildSystemPrompt/);
  assert.match(host, /class AgentHost/);
  assert.doesNotMatch(preload, /child_process|exec\(|spawn\(/);
  assert.doesNotMatch(host, /shell:\s*true/);
});

test('desktop ai session owns conversation history and maps agent events to activity', () => {
  const api = read('src/desktop/api.ts');
  const host = read('src/chat/agent/host.ts');

  assert.match(api, /sessions = new Map/);
  assert.match(api, /emit: \(event\) => deps\.emit\('ai:event'/);
  assert.match(host, /private messages: ChatMessage\[\]/);
  assert.match(host, /type: 'agent_event'/);
  assert.match(host, /type: 'approval_request'/);
  assert.match(host, /type: 'turn_end'/);
});
