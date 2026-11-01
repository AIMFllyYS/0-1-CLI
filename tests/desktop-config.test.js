const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(...file.split('/')), 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readRenderer() {
  return [
    path.join('desktop', 'src', 'renderer', 'App.tsx'),
    path.join('desktop', 'src', 'renderer', 'codex-shell', 'CodexShell.tsx'),
    path.join('desktop', 'src', 'renderer', 'codex-shell', 'useConversationState.ts'),
  ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

test('root package exposes desktop scripts', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.scripts['desktop:install'], 'npm install --prefix desktop');
  assert.equal(pkg.scripts['desktop:build'], 'npm run build && npm run build --prefix desktop');
  assert.match(pkg.scripts['desktop:dist:win'], /dist:win --prefix desktop/);
  assert.match(pkg.scripts['desktop:dist:mac'], /dist:mac --prefix desktop/);
});

test('desktop package uses electron vite react and electron-builder targets', () => {
  const pkg = readJson(path.join('desktop', 'package.json'));
  const builder = fs.readFileSync(path.join('desktop', 'electron-builder.yml'), 'utf8');

  assert.ok(pkg.dependencies.react);
  assert.ok(pkg.devDependencies.electron);
  assert.ok(pkg.devDependencies['electron-builder']);
  assert.ok(pkg.devDependencies.vite);
  assert.equal(pkg.repository.url, 'https://github.com/AIMFllyYS/0-1-CLI.git');
  assert.match(pkg.scripts.build, /copy:cli/);
  assert.match(builder, /nsis/);
  assert.match(builder, /dmg/);
});

test('desktop main preload and renderer entry files exist', () => {
  [
    'desktop/index.html',
    'desktop/src/main/main.ts',
    'desktop/src/main/clear-actions.ts',
    'desktop/src/main/cli-runner.ts',
    'desktop/src/main/github-release.ts',
    'desktop/src/main/skills-actions.ts',
    'desktop/src/main/permissions.ts',
    'desktop/src/preload/index.ts',
    'desktop/src/renderer/App.tsx',
    'desktop/src/renderer/styles.css',
    'desktop/scripts/copy-cli.cjs',
  ].forEach((file) => assert.equal(fs.existsSync(file), true, `${file} missing`));
});

test('desktop release workflow uploads windows and mac artifacts', () => {
  const workflow = fs.readFileSync(path.join('.github', 'workflows', 'desktop-release.yml'), 'utf8');

  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /npm install/);
  assert.doesNotMatch(workflow, /cache:\s*npm/);
  assert.match(workflow, /upload-artifact/);
  assert.match(workflow, /softprops\/action-gh-release/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /desktop:dist:win/);
  assert.match(workflow, /desktop:dist:mac/);
});

test('desktop runner supports packaged CLI resource path', () => {
  const runner = fs.readFileSync(path.join('desktop', 'src', 'main', 'cli-runner.ts'), 'utf8');
  const copyScript = fs.readFileSync(path.join('desktop', 'scripts', 'copy-cli.cjs'), 'utf8');

  assert.match(runner, /app\.isPackaged/);
  assert.match(runner, /dist['"], ['"]cli/);
  assert.match(runner, /ELECTRON_RUN_AS_NODE/);
  assert.match(copyScript, /pkg\.dependencies/);
  assert.match(copyScript, /--omit=dev/);
});

test('desktop IPC bridge restricts renderer origin and noninteractive commands', () => {
  const main = fs.readFileSync(path.join('desktop', 'src', 'main', 'main.ts'), 'utf8');
  const permissions = fs.readFileSync(path.join('desktop', 'src', 'main', 'permissions.ts'), 'utf8');
  const renderer = readRenderer();
  const actions = fs.readFileSync(path.join('desktop', 'src', 'renderer', 'action-catalog.ts'), 'utf8');
  const runner = fs.readFileSync(path.join('desktop', 'src', 'main', 'cli-runner.ts'), 'utf8');
  const allowedBlock = permissions.match(/ALLOWED_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
  const interactiveBlock = permissions.match(/INTERACTIVE_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';

  assert.match(main, /isAllowedRendererUrl/);
  assert.match(main, /senderFrame\?\.url/);
  assert.match(allowedBlock, /'state'/);
  assert.match(allowedBlock, /'api'/);
  assert.match(allowedBlock, /'pay'/);
  assert.match(interactiveBlock, /'install'/);
  assert.match(interactiveBlock, /'skills'/);
  assert.match(interactiveBlock, /'clear'/);
  assert.doesNotMatch(allowedBlock, /'install'/);
  assert.doesNotMatch(allowedBlock, /'skills'/);
  assert.doesNotMatch(allowedBlock, /'clear'/);
  assert.match(runner, /Command not allowed/);
  assert.doesNotMatch(renderer, /desktopActions/);
  assert.match(renderer, /sendAiMessage/);
  assert.match(actions, /hi --clear/);
  assert.match(actions, /hi --skills/);
  assert.match(actions, /hi --install/);
  assert.match(actions, /hi --state/);
  assert.match(actions, /hi --api/);
  assert.match(actions, /hi --pay/);
});

test('desktop builder is wired for GitHub release publishing', () => {
  const builder = fs.readFileSync(path.join('desktop', 'electron-builder.yml'), 'utf8');

  assert.match(builder, /provider: github/);
  assert.match(builder, /owner: AIMFllyYS/);
  assert.match(builder, /repo: 0-1-CLI/);
  assert.match(builder, /releaseType: release/);
});

test('desktop exposes trusted GitHub release IPC without hardcoded tokens', () => {
  const tools = read('desktop/src/main/tools-ipc.ts');
  const preload = read('desktop/src/preload/index.ts');
  const release = read('desktop/src/main/github-release.ts');

  assert.match(tools, /release:getLatest/);
  assert.match(tools, /release:openLatest/);
  assert.match(tools, /release:openAsset/);
  assert.match(tools, /releaseAssetUrls/);
  assert.match(tools, /shell/);
  assert.match(preload, /release:getLatest/);
  assert.match(preload, /release:openLatest/);
  assert.match(preload, /release:openAsset/);
  assert.match(release, /api\.github\.com\/repos\/AIMFllyYS\/0-1-CLI\/releases\/latest/);
  assert.doesNotMatch(release, /GITHUB_PERSONAL_ACCESS_TOKEN\s*=/);
  assert.doesNotMatch(release, /ghp_[A-Za-z0-9_]+/);
});

test('desktop primary renderer omits release asset panel from the ai workspace', () => {
  const renderer = readRenderer();
  const styles = fs.readFileSync(path.join('desktop', 'src', 'renderer', 'styles.css'), 'utf8');

  assert.doesNotMatch(renderer, /releaseInfo/);
  assert.doesNotMatch(renderer, /release\.assets/);
  assert.doesNotMatch(renderer, /Download asset/);
  assert.doesNotMatch(renderer, /browserDownloadUrl/);
  assert.doesNotMatch(styles, /\.releaseAssets/);
  assert.doesNotMatch(styles, /\.releaseAsset/);
});

test('desktop local release output is ignored by git', () => {
  const ignore = fs.readFileSync('.gitignore', 'utf8');

  assert.match(ignore, /desktop\/release\//);
});

test('desktop ai bridge ipc is isolated from cli run channel', () => {
  const tools = read('desktop/src/main/tools-ipc.ts');
  const api = read('src/desktop/api.ts');
  const runner = read('desktop/src/main/cli-runner.ts');

  assert.match(tools, /'cli:run'/);
  assert.match(api, /'ai:send'/);
  assert.match(runner, /export function runDesktopCli/);
  assert.doesNotMatch(api, /cli:run/);
  assert.doesNotMatch(tools, /ai:send|ai:approve/);
});
