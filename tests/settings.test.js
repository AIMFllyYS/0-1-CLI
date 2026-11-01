const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function freshHome() {
  const home = mkdtempSync(join(tmpdir(), 'hi-settings-home-'));
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  for (const key of Object.keys(require.cache)) {
    if (key.includes(join('dist', 'utils', 'config')) || key.includes(join('dist', 'settings'))) {
      delete require.cache[key];
    }
  }
  return home;
}

test('defaults keep today\'s behavior', () => {
  freshHome();
  const { loadSettings } = require('../dist/settings/store');
  const settings = loadSettings();

  assert.equal(settings.ai.defaultMode, 'chat');
  assert.equal(settings.ai.autoAccept, false);
  assert.equal(settings.ai.maxToolRounds, 8);
  assert.equal(settings.ai.defaultModelId, '');
  assert.equal(settings.github.prefetch, true);
  assert.equal(settings.startup.cliAutostart, false);
  assert.equal(settings.startup.desktopAutostart, false);
  assert.equal(settings.appearance.theme, 'system');
});

test('sanitizeSettings falls back per key and ignores unknown keys', () => {
  freshHome();
  const { sanitizeSettings } = require('../dist/settings/schema');
  const settings = sanitizeSettings({
    ai: { defaultMode: 'nonsense', maxToolRounds: 9999, autoAccept: 'yes', defaultModelId: 42 },
    github: { prefetch: false },
    appearance: { theme: 'dark' },
    bogus: { value: 1 },
  });

  assert.equal(settings.ai.defaultMode, 'chat');
  assert.equal(settings.ai.maxToolRounds, 8);
  assert.equal(settings.ai.autoAccept, false);
  assert.equal(settings.ai.defaultModelId, '');
  assert.equal(settings.github.prefetch, false);
  assert.equal(settings.appearance.theme, 'dark');
  assert.equal('bogus' in settings, false);
});

test('sanitizeSettings survives non-object input', () => {
  freshHome();
  const { sanitizeSettings, defaultSettings } = require('../dist/settings/schema');
  for (const bad of [null, undefined, 'x', 7, [], true]) {
    assert.deepEqual(sanitizeSettings(bad), defaultSettings());
  }
});

test('parseSettingValue handles booleans in english and chinese', () => {
  freshHome();
  const { parseSettingValue, findSettingDef } = require('../dist/settings/schema');
  const def = findSettingDef('github.prefetch');

  for (const yes of ['true', 'ON', 'yes', '1', '开', '是', '启用']) assert.equal(parseSettingValue(def, yes), true, yes);
  for (const no of ['false', 'Off', 'no', '0', '关', '否', '禁用']) assert.equal(parseSettingValue(def, no), false, no);
  assert.throws(() => parseSettingValue(def, 'maybe'), /开关/);
});

test('parseSettingValue validates enums and integer ranges', () => {
  freshHome();
  const { parseSettingValue, findSettingDef } = require('../dist/settings/schema');

  assert.equal(parseSettingValue(findSettingDef('ai.defaultMode'), 'agent'), 'agent');
  assert.throws(() => parseSettingValue(findSettingDef('ai.defaultMode'), 'turbo'), /chat.*agent.*plan/);
  assert.equal(parseSettingValue(findSettingDef('ai.maxToolRounds'), '12'), 12);
  assert.throws(() => parseSettingValue(findSettingDef('ai.maxToolRounds'), '0'), /1.*50/);
  assert.throws(() => parseSettingValue(findSettingDef('ai.maxToolRounds'), '51'), /1.*50/);
  assert.throws(() => parseSettingValue(findSettingDef('ai.maxToolRounds'), '3.5'), /整数/);
  assert.throws(() => parseSettingValue(findSettingDef('ai.maxToolRounds'), 'abc'), /整数/);
  assert.equal(parseSettingValue(findSettingDef('ai.defaultModelId'), '  my-model  '), 'my-model');
});

test('findSettingDef lists valid keys for an unknown key', () => {
  freshHome();
  const { findSettingDef } = require('../dist/settings/schema');
  assert.throws(() => findSettingDef('ai.nope'), (error) => /未知设置项：ai\.nope/.test(error.message) && /github\.prefetch/.test(error.message));
});

test('updateSetting persists, keeps other config keys, and loadSettings reflects it', () => {
  const home = freshHome();
  writeFileSync(join(home, '.coding-cli.json'), JSON.stringify({ projectRoot: 'D:/p', launch: [{ id: 'x' }] }), 'utf8');
  const { updateSetting, loadSettings } = require('../dist/settings/store');

  const result = updateSetting('ai.defaultMode', 'plan');
  assert.equal(result.value, 'plan');
  updateSetting('github.prefetch', 'off');

  const saved = JSON.parse(readFileSync(join(home, '.coding-cli.json'), 'utf8'));
  assert.equal(saved.projectRoot, 'D:/p');
  assert.deepEqual(saved.launch, [{ id: 'x' }]);
  assert.equal(saved.settings.ai.defaultMode, 'plan');
  assert.equal(saved.settings.github.prefetch, false);

  const settings = loadSettings();
  assert.equal(settings.ai.defaultMode, 'plan');
  assert.equal(settings.github.prefetch, false);
  assert.equal(settings.ai.maxToolRounds, 8);
});

test('updateSetting warns when enabling auto accept', () => {
  freshHome();
  const { updateSetting } = require('../dist/settings/store');
  const result = updateSetting('ai.autoAccept', 'true');
  assert.equal(result.value, true);
  assert.match(result.warning, /自动接受/);
  assert.equal(updateSetting('ai.autoAccept', 'false').warning, undefined);
});

test('updateSetting rejects bad input without touching the file', () => {
  const home = freshHome();
  const file = join(home, '.coding-cli.json');
  writeFileSync(file, '{"projectRoot":"D:/p"}', 'utf8');
  const { updateSetting } = require('../dist/settings/store');

  assert.throws(() => updateSetting('ai.defaultMode', 'turbo'), /chat/);
  assert.throws(() => updateSetting('nope.key', 'x'), /未知设置项/);
  assert.equal(readFileSync(file, 'utf8'), '{"projectRoot":"D:/p"}');
});

test('a corrupt config file is never overwritten by settings writes', () => {
  const home = freshHome();
  const file = join(home, '.coding-cli.json');
  const corrupt = '{ "projectRoot": "D:/p", ';
  writeFileSync(file, corrupt, 'utf8');
  const { updateSetting, loadSettings } = require('../dist/settings/store');

  assert.throws(() => updateSetting('ai.defaultMode', 'agent'), /配置文件/);
  assert.equal(readFileSync(file, 'utf8'), corrupt);
  assert.equal(loadSettings().ai.defaultMode, 'chat');
});

test('resetSetting restores one key or everything', () => {
  freshHome();
  const { updateSetting, resetSetting, loadSettings } = require('../dist/settings/store');
  updateSetting('ai.defaultMode', 'agent');
  updateSetting('ai.maxToolRounds', '20');

  resetSetting('ai.defaultMode');
  assert.equal(loadSettings().ai.defaultMode, 'chat');
  assert.equal(loadSettings().ai.maxToolRounds, 20);

  resetSetting();
  assert.equal(loadSettings().ai.maxToolRounds, 8);
});

test('formatSettingsList renders a table and parseable json', () => {
  freshHome();
  const { loadSettings } = require('../dist/settings/store');
  const { formatSettingsList } = require('../dist/settings/format');
  const settings = loadSettings();

  const text = formatSettingsList(settings, { json: false });
  assert.match(text, /ai\.defaultMode/);
  assert.match(text, /github\.prefetch/);
  assert.match(text, /默认/);

  const rows = JSON.parse(formatSettingsList(settings, { json: true }));
  const prefetch = rows.find((row) => row.key === 'github.prefetch');
  assert.equal(prefetch.value, true);
  assert.equal(prefetch.default, true);
  assert.equal(prefetch.isDefault, true);
  assert.equal(typeof prefetch.description, 'string');
});

function startupDir() {
  return mkdtempSync(join(tmpdir(), 'hi-startup-'));
}

test('buildStartupScript quotes paths, prefers wt, and falls back to cmd', () => {
  freshHome();
  const { buildStartupScript } = require('../dist/settings/autostart');
  const script = buildStartupScript({
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    entryPath: 'D:\\projects\\无人值守 dir\\dist\\index.js',
    home: 'C:\\Users\\Someone',
  });

  assert.match(script, /chcp 65001/);
  assert.match(script, /where wt\.exe/);
  assert.match(script, /start "" wt\.exe -d "C:\\Users\\Someone"/);
  assert.match(script, /cmd \/d \/s \/k ""C:\\Program Files\\nodejs\\node\.exe" "D:\\projects\\无人值守 dir\\dist\\index\.js""/);
  assert.match(script, /start "" \/d "C:\\Users\\Someone" cmd/);
  assert.match(script, /hi config set startup\.cliAutostart off/);
});

test('buildStartupScript rejects paths that would break batch or wt parsing', () => {
  freshHome();
  const { buildStartupScript } = require('../dist/settings/autostart');
  for (const bad of ['C:\\50%\\node.exe', 'C:\\a&b\\node.exe', 'C:\\a;b\\node.exe', 'C:\\a"b\\node.exe', 'C:\\a^b\\node.exe']) {
    assert.throws(
      () => buildStartupScript({ nodePath: bad, entryPath: 'D:\\x\\index.js', home: 'C:\\h' }),
      /不支持的字符/,
      bad,
    );
  }
});

test('enable and disable autostart write and remove the startup script', () => {
  freshHome();
  const { enableAutostart, disableAutostart, isAutostartEnabled, STARTUP_FILE_NAME } = require('../dist/settings/autostart');
  const dir = startupDir();
  const deps = { startupDir: dir, platform: 'win32', nodePath: 'C:\\n\\node.exe', entryPath: 'D:\\x\\index.js', home: 'C:\\h' };

  assert.equal(isAutostartEnabled(deps), false);
  const file = enableAutostart(deps);
  assert.equal(file, join(dir, STARTUP_FILE_NAME));
  assert.equal(isAutostartEnabled(deps), true);
  assert.match(readFileSync(file, 'utf8'), /node\.exe/);

  assert.equal(disableAutostart(deps), true);
  assert.equal(isAutostartEnabled(deps), false);
  assert.equal(disableAutostart(deps), false);
  assert.deepEqual(readdirSync(dir), []);
});

test('autostart refuses non-Windows platforms and a missing startup folder', () => {
  freshHome();
  const { enableAutostart } = require('../dist/settings/autostart');
  assert.throws(() => enableAutostart({ platform: 'linux', startupDir: startupDir() }), /仅支持 Windows/);
  assert.throws(() => enableAutostart({ platform: 'win32', startupDir: join(tmpdir(), 'hi-no-such-startup-dir') }), /启动文件夹/);
});

function hi(home, startup, ...args) {
  return spawnSync(process.execPath, ['dist/index.js', ...args], {
    encoding: 'utf8',
    env: { ...process.env, USERPROFILE: home, HOME: home, HI_STARTUP_DIR: startup },
  });
}

test('hi config list/get/set/reset work end to end', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-config-e2e-'));
  const startup = startupDir();

  assert.equal(hi(home, startup, 'config', 'get', 'ai.defaultMode').stdout.trim(), 'chat');
  assert.equal(hi(home, startup, 'config', 'set', 'ai.defaultMode', 'agent').status, 0);
  assert.equal(hi(home, startup, 'config', 'get', 'ai.defaultMode').stdout.trim(), 'agent');

  const rows = JSON.parse(hi(home, startup, 'config', 'list', '--json').stdout);
  assert.equal(rows.find((row) => row.key === 'ai.defaultMode').value, 'agent');
  assert.equal(rows.find((row) => row.key === 'ai.defaultMode').isDefault, false);

  assert.match(hi(home, startup, 'config', 'list').stdout, /ai\.defaultMode/);

  assert.equal(hi(home, startup, 'config', 'reset', 'ai.defaultMode').status, 0);
  assert.equal(hi(home, startup, 'config', 'get', 'ai.defaultMode').stdout.trim(), 'chat');
});

test('hi config reports bad keys and values with exit code 1', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-config-e2e-'));
  const startup = startupDir();

  const badKey = hi(home, startup, 'config', 'get', 'nope');
  assert.equal(badKey.status, 1);
  assert.match(badKey.stderr, /未知设置项/);

  const badValue = hi(home, startup, 'config', 'set', 'ai.maxToolRounds', '0');
  assert.equal(badValue.status, 1);
  assert.match(badValue.stderr, /1.*50/);
});

test('hi config set startup.cliAutostart installs and removes the startup script', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-config-e2e-'));
  const startup = startupDir();

  const on = hi(home, startup, 'config', 'set', 'startup.cliAutostart', 'on');
  assert.equal(on.status, 0, on.stderr);
  assert.equal(existsSync(join(startup, 'hi-cli-autostart.cmd')), true);
  assert.equal(hi(home, startup, 'config', 'get', 'startup.cliAutostart').stdout.trim(), 'true');

  const off = hi(home, startup, 'config', 'set', 'startup.cliAutostart', 'off');
  assert.equal(off.status, 0, off.stderr);
  assert.equal(existsSync(join(startup, 'hi-cli-autostart.cmd')), false);
});

test('a failed autostart change does not persist the setting', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-config-e2e-'));
  const missing = join(tmpdir(), 'hi-config-no-such-startup');

  const result = hi(home, missing, 'config', 'set', 'startup.cliAutostart', 'on');
  assert.equal(result.status, 1);
  assert.equal(hi(home, missing, 'config', 'get', 'startup.cliAutostart').stdout.trim(), 'false');
});

test('createSessionState honors an explicit default mode and keeps old behavior otherwise', () => {
  freshHome();
  const { createSessionState } = require('../dist/chat/session');

  const legacy = createSessionState({ modelId: 'm' });
  assert.deepEqual([legacy.mode, legacy.permissionMode], ['chat', 'ask']);

  const legacyAuto = createSessionState({ modelId: 'm', autoAccept: true });
  assert.deepEqual([legacyAuto.mode, legacyAuto.permissionMode], ['agent', 'bypass']);

  assert.deepEqual(
    (({ mode, permissionMode }) => [mode, permissionMode])(createSessionState({ modelId: 'm', mode: 'agent' })),
    ['agent', 'ask'],
  );
  assert.deepEqual(
    (({ mode, permissionMode }) => [mode, permissionMode])(createSessionState({ modelId: 'm', mode: 'plan' })),
    ['plan', 'plan'],
  );
  assert.deepEqual(
    (({ mode, permissionMode }) => [mode, permissionMode])(createSessionState({ modelId: 'm', mode: 'agent', autoAccept: true })),
    ['agent', 'bypass'],
  );
  assert.deepEqual(
    (({ mode, permissionMode }) => [mode, permissionMode])(createSessionState({ modelId: 'm', mode: 'chat', autoAccept: true })),
    ['chat', 'ask'],
  );
});

test('resolveStartOptions merges settings under explicit flags', () => {
  freshHome();
  const { resolveStartOptions } = require('../dist/settings/runtime');
  const { defaultSettings } = require('../dist/settings/schema');
  const base = defaultSettings();
  const custom = {
    ...base,
    ai: { ...base.ai, defaultMode: 'plan', defaultModelId: 'my-model', maxToolRounds: 20, autoAccept: false },
  };

  assert.deepEqual(resolveStartOptions({}, custom), {
    mode: 'plan', modelId: 'my-model', autoAccept: false, maxToolRounds: 20,
  });
  assert.deepEqual(resolveStartOptions({ modelId: 'cli-model' }, custom).modelId, 'cli-model');

  const flagAuto = resolveStartOptions({ autoAccept: true }, custom);
  assert.equal(flagAuto.autoAccept, true);
  assert.equal(flagAuto.mode, 'agent');

  const settingAuto = resolveStartOptions({}, { ...custom, ai: { ...custom.ai, autoAccept: true } });
  assert.equal(settingAuto.autoAccept, true);
  assert.equal(settingAuto.mode, 'plan');
});

// A fake `gh` that records every call, so the test can prove whether GitHub was touched.
function stateRun(prefetch) {
  const home = mkdtempSync(join(tmpdir(), 'hi-config-e2e-'));
  const startup = startupDir();
  const bin = mkdtempSync(join(tmpdir(), 'hi-fake-gh-'));
  const marker = join(bin, 'gh-was-called.txt');
  writeFileSync(join(bin, 'gh.cmd'), `@echo off\r\necho called>> "${marker}"\r\nexit /b 1\r\n`, 'utf8');
  mkdirSync(join(home, 'proj'));
  writeFileSync(join(home, '.coding-cli.json'), JSON.stringify({ projectRoot: join(home, 'proj').replace(/\\/g, '/') }), 'utf8');
  hi(home, startup, 'config', 'set', 'github.prefetch', prefetch);

  const result = spawnSync(process.execPath, ['dist/index.js', '--state'], {
    encoding: 'utf8',
    env: { ...process.env, USERPROFILE: home, HOME: home, PATH: `${bin};${process.env.PATH}` },
  });
  return { result, ghCalled: existsSync(marker) };
}

test('hi --state does not call GitHub when github.prefetch is off', () => {
  const { result, ghCalled } = stateRun('off');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(ghCalled, false);
  assert.match(result.stdout, /已关闭启动时预读/);
  assert.match(result.stdout, /hi --gh/);
  assert.equal((result.stdout.match(/GitHub Status/g) || []).length, 1);
});

test('hi --state still reads GitHub when github.prefetch is on', () => {
  const { result, ghCalled } = stateRun('on');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(ghCalled, true, 'the fake gh must be reached, otherwise the off-case test proves nothing');
  assert.doesNotMatch(result.stdout, /已关闭启动时预读/);
  assert.equal((result.stdout.match(/GitHub Status/g) || []).length, 1);
});

test('hi --help lists the config command', () => {
  const help = execFileSync(process.execPath, ['dist/index.js', '--help'], { encoding: 'utf8' });
  assert.match(help, /hi config/);
});
