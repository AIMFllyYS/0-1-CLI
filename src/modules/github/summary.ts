import { execFile } from 'child_process';

// A read-only snapshot for the desktop app. Unlike getRecentIssues it never exposes tokens, makes a
// single search request instead of one per repository, and always returns within a time limit.

export interface GitHubAccountView {
  username: string;
  hostname: string;
  isActive: boolean;
}

export interface GitHubIssueView {
  number: number;
  title: string;
  repo: string;
  url: string;
  createdAt: string;
}

export interface GitHubSummary {
  ok: true;
  available: boolean;
  reason?: string;
  accounts: GitHubAccountView[];
  activeUsername: string;
  issues: GitHubIssueView[];
  totalIssues: number;
  issuesError?: string;
}

export interface SummaryOptions {
  days?: number;
  limit?: number;
  timeoutMs?: number;
}

export interface SummaryDeps {
  runGh: (args: string[]) => Promise<string>;
  now: () => Date;
}

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 12000;
// GitHub logins are alphanumerics and single hyphens; anything else is never interpolated into a query.
const SAFE_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export function parseAccountsFromStatus(output: string): GitHubAccountView[] {
  const accounts: GitHubAccountView[] = [];
  let hostname = 'github.com';
  let current: GitHubAccountView | null = null;

  for (const line of output.split(/\r?\n/)) {
    const login = line.match(/Logged in to (\S+) account (\S+)/);
    if (login) {
      current = { username: login[2], hostname: login[1], isActive: false };
      accounts.push(current);
      continue;
    }
    const host = line.match(/^(\S+)\s*$/);
    if (host && !line.includes(':')) {
      hostname = host[1];
      continue;
    }
    const active = line.match(/Active account:\s*(true|false)/);
    if (active && current) current.isActive = active[1] === 'true';
  }
  return accounts.map((account) => ({ ...account, hostname: account.hostname || hostname }));
}

function defaultRunGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // gh writes login status to stderr on some versions, so both streams are read.
    execFile('gh', args, { encoding: 'utf8', windowsHide: true, timeout: DEFAULT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const text = `${stdout || ''}${stderr || ''}`;
      if (error && !text) {
        reject(error);
        return;
      }
      if (error && args[0] !== 'auth') {
        reject(new Error(text.trim() || error.message));
        return;
      }
      resolve(text);
    });
  });
}

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

function timeLimit<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('读取 GitHub 超时')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function repoFromUrl(repositoryUrl: unknown): string {
  return typeof repositoryUrl === 'string' ? repositoryUrl.replace(/^.*\/repos\//, '') : '';
}

function unavailable(reason: string): GitHubSummary {
  return { ok: true, available: false, reason, accounts: [], activeUsername: '', issues: [], totalIssues: 0 };
}

export async function getGitHubSummary(
  options: SummaryOptions = {},
  deps: SummaryDeps = { runGh: defaultRunGh, now: () => new Date() },
): Promise<GitHubSummary> {
  const days = clamp(options.days, DEFAULT_DAYS, MAX_DAYS);
  const limit = clamp(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const timeoutMs = clamp(options.timeoutMs, DEFAULT_TIMEOUT_MS, 60000);

  let status: string;
  try {
    status = await timeLimit(deps.runGh(['auth', 'status']), timeoutMs);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return unavailable('未找到 gh 命令，请先安装 GitHub CLI');
    return unavailable((error as Error).message || '无法读取 GitHub');
  }

  const accounts = parseAccountsFromStatus(status);
  const active = accounts.find((account) => account.isActive) || accounts[0];
  if (!active) {
    return {
      ok: true,
      available: true,
      reason: '尚未登录 GitHub，请运行 gh auth login',
      accounts: [],
      activeUsername: '',
      issues: [],
      totalIssues: 0,
    };
  }

  const summary: GitHubSummary = {
    ok: true,
    available: true,
    accounts,
    activeUsername: active.username,
    issues: [],
    totalIssues: 0,
  };

  if (!SAFE_LOGIN.test(active.username)) return summary;

  const since = deps.now();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  try {
    const raw = await timeLimit(
      deps.runGh([
        'api', '-X', 'GET', 'search/issues',
        '-f', `q=is:issue is:open user:${active.username} created:>=${sinceDate}`,
        '-f', 'sort=created', '-f', 'order=desc',
        '-f', `per_page=${limit}`,
      ]),
      timeoutMs,
    );
    const parsed = JSON.parse(raw);
    const items: Array<Record<string, unknown>> = Array.isArray(parsed.items) ? parsed.items : [];
    summary.totalIssues = typeof parsed.total_count === 'number' ? parsed.total_count : items.length;
    summary.issues = items
      .map((item) => ({
        number: Number(item.number),
        title: String(item.title ?? ''),
        repo: repoFromUrl(item.repository_url),
        url: String(item.html_url ?? ''),
        createdAt: String(item.created_at ?? ''),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    summary.issuesError = (error as Error).message || '读取 Issues 失败';
  }
  return summary;
}
