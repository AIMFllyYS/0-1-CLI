const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const KEYS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_MODELS', 'DEEPSEEK_API_KEY', 'ZHIPU_API_KEY'];

function freshHome() {
  const home = mkdtempSync(join(tmpdir(), 'hi-cred-home-'));
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  KEYS.forEach((key) => delete process.env[key]);
  for (const key of Object.keys(require.cache)) {
    if (key.includes(join('dist', 'utils', 'config')) || key.includes(join('dist', 'settings'))) delete require.cache[key];
  }
  return home;
}

test('saveProvider stores credentials in the user config and keeps other keys', () => {
  const home = freshHome();
  writeFileSync(join(home, '.coding-cli.json'), JSON.stringify({ projectRoot: 'D:/p', settings: { ai: { defaultMode: 'plan' } } }), 'utf8');
  const { saveProvider, loadProvider } = require('../dist/settings/provider');

  saveProvider({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret-123456', modelIds: ['m1', 'm2'], activeModelId: 'm2' });

  const saved = JSON.parse(readFileSync(join(home, '.coding-cli.json'), 'utf8'));
  assert.equal(saved.projectRoot, 'D:/p');
  assert.equal(saved.settings.ai.defaultMode, 'plan');
  assert.equal(saved.provider.apiKey, 'sk-secret-123456');
  assert.deepEqual(loadProvider(), {
    baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret-123456', modelIds: ['m1', 'm2'], activeModelId: 'm2',
  });
});

test('saveProvider validates and rejects a bad url, a missing key and empty models', () => {
  freshHome();
  const { saveProvider } = require('../dist/settings/provider');
  const ok = { baseUrl: 'https://api.example.com/v1', apiKey: 'k', modelIds: ['m'], activeModelId: 'm' };

  assert.throws(() => saveProvider({ ...ok, baseUrl: 'not a url' }), /URL/);
  assert.throws(() => saveProvider({ ...ok, baseUrl: 'ftp://x.com' }), /http/);
  assert.throws(() => saveProvider({ ...ok, apiKey: '  ' }), /API Key/);
  assert.throws(() => saveProvider({ ...ok, modelIds: [] }), /模型/);
  assert.throws(() => saveProvider({ ...ok, activeModelId: 'other' }), /当前模型/);
});

test('applyProviderToEnv fills missing variables and never overrides existing ones', () => {
  freshHome();
  const { saveProvider, applyProviderToEnv } = require('../dist/settings/provider');
  saveProvider({ baseUrl: 'https://api.example.com/v1', apiKey: 'from-config', modelIds: ['a', 'b'], activeModelId: 'b' });

  const env = { AI_API_KEY: 'from-env' };
  applyProviderToEnv(env);
  assert.equal(env.AI_API_KEY, 'from-env');
  assert.equal(env.AI_BASE_URL, 'https://api.example.com/v1');
  assert.equal(env.AI_MODELS, 'a,b');
  assert.equal(env.AI_MODEL, 'b');
});

test('applyProviderToEnv does nothing when nothing is configured', () => {
  freshHome();
  const { applyProviderToEnv } = require('../dist/settings/provider');
  const env = {};
  applyProviderToEnv(env);
  assert.deepEqual(env, {});
});

test('a legacy .env file is still read as a fallback source', () => {
  freshHome();
  const dir = mkdtempSync(join(tmpdir(), 'hi-cred-env-'));
  const envFile = join(dir, '.env');
  writeFileSync(envFile, 'AI_BASE_URL=https://legacy.example.com/v1\nAI_API_KEY=legacy-key\nAI_MODELS=l1,l2\nAI_MODEL=l1\n', 'utf8');
  const { loadProvider } = require('../dist/settings/provider');

  const provider = loadProvider({ legacyEnvPath: envFile });
  assert.equal(provider.baseUrl, 'https://legacy.example.com/v1');
  assert.equal(provider.apiKey, 'legacy-key');
  assert.deepEqual(provider.modelIds, ['l1', 'l2']);
  assert.equal(provider.activeModelId, 'l1');
});

test('user config wins over the legacy .env file', () => {
  freshHome();
  const dir = mkdtempSync(join(tmpdir(), 'hi-cred-env-'));
  const envFile = join(dir, '.env');
  writeFileSync(envFile, 'AI_BASE_URL=https://legacy.example.com/v1\nAI_API_KEY=legacy-key\nAI_MODELS=l1\nAI_MODEL=l1\n', 'utf8');
  const { saveProvider, loadProvider } = require('../dist/settings/provider');
  saveProvider({ baseUrl: 'https://new.example.com/v1', apiKey: 'new-key', modelIds: ['n1'], activeModelId: 'n1' });

  assert.equal(loadProvider({ legacyEnvPath: envFile }).apiKey, 'new-key');
});

test('describeProvider masks the key and never returns it', () => {
  freshHome();
  const { saveProvider, describeProvider } = require('../dist/settings/provider');
  saveProvider({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-abcdefghijklmnop', modelIds: ['m'], activeModelId: 'm' });

  const view = describeProvider();
  assert.equal(view.configured, true);
  assert.equal(view.baseUrl, 'https://api.example.com/v1');
  assert.deepEqual(view.modelIds, ['m']);
  assert.notEqual(view.apiKeyMasked, 'sk-abcdefghijklmnop');
  assert.match(view.apiKeyMasked, /\*/);
  assert.equal(JSON.stringify(view).includes('abcdefghijklmnop'), false);
  assert.equal('apiKey' in view, false);
});

test('describeProvider reports an unconfigured provider', () => {
  freshHome();
  const { describeProvider } = require('../dist/settings/provider');
  const view = describeProvider();
  assert.equal(view.configured, false);
  assert.equal(view.apiKeyMasked, '');
});

test('updateProvider keeps the stored key when the new key is blank', () => {
  freshHome();
  const { saveProvider, updateProvider, loadProvider } = require('../dist/settings/provider');
  saveProvider({ baseUrl: 'https://a.example.com/v1', apiKey: 'keep-me-123456', modelIds: ['m'], activeModelId: 'm' });

  updateProvider({ baseUrl: 'https://b.example.com/v1', apiKey: '', modelIds: ['m', 'n'], activeModelId: 'n' });
  const provider = loadProvider();
  assert.equal(provider.apiKey, 'keep-me-123456');
  assert.equal(provider.baseUrl, 'https://b.example.com/v1');
  assert.equal(provider.activeModelId, 'n');
});

test('a corrupt user config is never overwritten by a provider save', () => {
  const home = freshHome();
  const file = join(home, '.coding-cli.json');
  writeFileSync(file, '{ "projectRoot": ', 'utf8');
  const { saveProvider } = require('../dist/settings/provider');

  assert.throws(
    () => saveProvider({ baseUrl: 'https://a.example.com/v1', apiKey: 'k', modelIds: ['m'], activeModelId: 'm' }),
    /配置文件/,
  );
  assert.equal(readFileSync(file, 'utf8'), '{ "projectRoot": ');
});

test('the provider section is not printed by hi config list or get', () => {
  const home = freshHome();
  const { saveProvider } = require('../dist/settings/provider');
  saveProvider({ baseUrl: 'https://a.example.com/v1', apiKey: 'sk-never-print-me', modelIds: ['m'], activeModelId: 'm' });
  const run = (...args) => spawnSync(process.execPath, ['dist/index.js', ...args], {
    encoding: 'utf8', env: { ...process.env, USERPROFILE: home, HOME: home },
  });

  assert.equal((run('config', 'list').stdout + run('config', 'list', '--json').stdout).includes('sk-never-print-me'), false);
  assert.equal(run('config', 'get', 'provider.apiKey').status, 1);
});

test('the real cli entry point loads saved credentials into the environment at startup', () => {
  const home = freshHome();
  const { saveProvider } = require('../dist/settings/provider');
  saveProvider({ baseUrl: 'https://cli.example.com/v1', apiKey: 'cli-key-123456', modelIds: ['cm'], activeModelId: 'cm' });

  // Run the actual dist/index.js, then print what the environment looked like once it had loaded.
  const hook = join(home, 'after-load.js');
  writeFileSync(hook, [
    'process.on("exit", () => {',
    '  process.stderr.write("ENV " + JSON.stringify({ k: process.env.AI_API_KEY, u: process.env.AI_BASE_URL, m: process.env.AI_MODEL }) + "\\n");',
    '});',
  ].join('\n'), 'utf8');
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_MODELS'].forEach((key) => delete env[key]);

  const run = spawnSync(process.execPath, ['--require', hook, 'dist/index.js', 'config', 'get', 'ai.defaultMode'], { encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr);
  const line = run.stderr.split('\n').find((entry) => entry.startsWith('ENV '));
  assert.deepEqual(JSON.parse(line.slice(4)), { k: 'cli-key-123456', u: 'https://cli.example.com/v1', m: 'cm' });

  // And an explicit shell variable still wins over the saved value.
  const override = spawnSync(process.execPath, ['--require', hook, 'dist/index.js', 'config', 'get', 'ai.defaultMode'], {
    encoding: 'utf8', env: { ...env, AI_API_KEY: 'shell-wins' },
  });
  const overrideLine = override.stderr.split('\n').find((entry) => entry.startsWith('ENV '));
  assert.equal(JSON.parse(overrideLine.slice(4)).k, 'shell-wins');
});
