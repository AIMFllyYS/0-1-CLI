const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const { getGitHubSummary, parseAccountsFromStatus } = require('../dist/modules/github/summary');

const STATUS = [
  'github.com',
  "  ✓ Logged in to github.com account Alice (keyring)",
  '  - Active account: true',
  '  - Git operations protocol: https',
  '  - Token: gho_supersecrettokenvalue1234',
  "  - Token scopes: 'gist', 'repo'",
  '',
  "  ✓ Logged in to github.com account Bob (keyring)",
  '  - Active account: false',
  '  - Git operations protocol: https',
  '  - Token: gho_anothersecret5678',
  "  - Token scopes: 'repo'",
].join('\n');

function deps(overrides = {}) {
  const calls = [];
  const base = {
    runGh: async (args) => {
      calls.push(args);
      if (args[0] === 'auth') return STATUS;
      if (args[0] === 'api') {
        return JSON.stringify({
          total_count: 2,
          items: [
            { number: 9, title: 'Newer', repository_url: 'https://api.github.com/repos/Alice/web', html_url: 'https://github.com/Alice/web/issues/9', created_at: '2026-06-02T00:00:00Z' },
            { number: 4, title: 'Older', repository_url: 'https://api.github.com/repos/Alice/cli', html_url: 'https://github.com/Alice/cli/issues/4', created_at: '2026-06-01T00:00:00Z' },
          ],
        });
      }
      throw new Error(`unexpected gh call ${args.join(' ')}`);
    },
    now: () => new Date('2026-06-10T00:00:00Z'),
  };
  return { calls, deps: { ...base, ...overrides } };
}

test('parseAccountsFromStatus returns usernames and active flags and never a token', () => {
  const accounts = parseAccountsFromStatus(STATUS);
  assert.deepEqual(accounts, [
    { username: 'Alice', hostname: 'github.com', isActive: true },
    { username: 'Bob', hostname: 'github.com', isActive: false },
  ]);
  assert.equal(JSON.stringify(accounts).includes('gho_'), false);
});

test('parseAccountsFromStatus tolerates empty and unrelated output', () => {
  assert.deepEqual(parseAccountsFromStatus(''), []);
  assert.deepEqual(parseAccountsFromStatus('You are not logged into any GitHub hosts.'), []);
});

test('summary lists accounts and the newest open issues of the active account', async () => {
  const { deps: d, calls } = deps();
  const summary = await getGitHubSummary({ days: 7, limit: 10 }, d);

  assert.equal(summary.ok, true);
  assert.equal(summary.available, true);
  assert.equal(summary.activeUsername, 'Alice');
  assert.deepEqual(summary.accounts.map((account) => account.username), ['Alice', 'Bob']);
  assert.deepEqual(summary.issues.map((issue) => issue.number), [9, 4]);
  assert.deepEqual(summary.issues[0], {
    number: 9, title: 'Newer', repo: 'Alice/web', url: 'https://github.com/Alice/web/issues/9', createdAt: '2026-06-02T00:00:00Z',
  });
  assert.equal(summary.totalIssues, 2);
  assert.equal(JSON.stringify(summary).includes('gho_'), false);

  const apiCall = calls.find((args) => args[0] === 'api');
  assert.ok(apiCall.join(' ').includes('user:Alice'));
  assert.ok(apiCall.join(' ').includes('created:>=2026-06-03'));
  assert.ok(apiCall.join(' ').includes('is:issue'));
});

test('summary uses one search request instead of one request per repository', async () => {
  const { deps: d, calls } = deps();
  await getGitHubSummary({}, d);
  assert.equal(calls.filter((args) => args[0] === 'api').length, 1);
});

test('summary reports gh as unavailable instead of failing', async () => {
  const { deps: d } = deps({
    runGh: async () => { const error = new Error('spawn gh ENOENT'); error.code = 'ENOENT'; throw error; },
  });
  const summary = await getGitHubSummary({}, d);
  assert.equal(summary.ok, true);
  assert.equal(summary.available, false);
  assert.match(summary.reason, /gh/);
  assert.deepEqual(summary.accounts, []);
  assert.deepEqual(summary.issues, []);
});

test('summary reports not-logged-in separately from gh missing', async () => {
  const { deps: d } = deps({ runGh: async () => 'You are not logged into any GitHub hosts. Run gh auth login to authenticate.' });
  const summary = await getGitHubSummary({}, d);
  assert.equal(summary.available, true);
  assert.deepEqual(summary.accounts, []);
  assert.equal(summary.activeUsername, '');
  assert.match(summary.reason, /gh auth login/);
});

test('an issues failure keeps the accounts and reports the error', async () => {
  const { deps: d } = deps({
    runGh: async (args) => {
      if (args[0] === 'auth') return STATUS;
      throw new Error('API rate limit exceeded');
    },
  });
  const summary = await getGitHubSummary({}, d);
  assert.equal(summary.available, true);
  assert.equal(summary.accounts.length, 2);
  assert.deepEqual(summary.issues, []);
  assert.match(summary.issuesError, /rate limit/);
});

test('summary is bounded by a timeout and never hangs the caller', async () => {
  const { deps: d } = deps({ runGh: () => new Promise(() => {}) });
  const started = Date.now();
  const summary = await getGitHubSummary({ timeoutMs: 80 }, d);
  assert.ok(Date.now() - started < 1500);
  assert.equal(summary.available, false);
  assert.match(summary.reason, /超时/);
});

test('days and limit are clamped to sane bounds', async () => {
  const { deps: d, calls } = deps();
  await getGitHubSummary({ days: 100000, limit: 100000 }, d);
  const apiCall = calls.find((args) => args[0] === 'api').join(' ');
  assert.match(apiCall, /per_page=50/);
  assert.match(apiCall, /created:>=2026-03-12/);
});

test('a login that is not a plain username is never put in a search query', async () => {
  const evil = STATUS.replace('account Alice', 'account Alice created:>2000 user:other');
  const { deps: d, calls } = deps({
    runGh: async (args) => (args[0] === 'auth' ? evil : '{"total_count":0,"items":[]}'),
  });
  const summary = await getGitHubSummary({}, d);
  assert.equal(calls.some((args) => args[0] === 'api'), false);
  assert.deepEqual(summary.issues, []);
});
