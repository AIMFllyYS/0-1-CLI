import * as path from 'path';
import * as readline from 'readline';
import type { Readable, Writable } from 'stream';
import { probeStart } from './probe';
import { assertDirectory, isValidId, slugifyId } from './registry';
import type { AddLaunchInput } from './registry';

export class PromptCancelled extends Error {
  constructor() {
    super('已取消');
    this.name = 'PromptCancelled';
  }
}

export interface Prompter {
  ask(question: string): Promise<string>;
  close(): void;
}

export interface CollectDeps {
  prompter: Prompter;
  existingIds: string[];
  cwd: string;
  log: (message: string) => void;
}

// Lines are queued so piped input that arrives ahead of a question is not lost; end of input cancels.
export function createPrompter(input: Readable, output: Writable): Prompter {
  const rl = readline.createInterface({ input, terminal: false });
  const lines: string[] = [];
  const waiters: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
  let closed = false;

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    for (const waiter of waiters.splice(0)) waiter.reject(new PromptCancelled());
  });

  return {
    ask(question) {
      output.write(question);
      const queued = lines.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (closed) return Promise.reject(new PromptCancelled());
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    close() {
      rl.close();
    },
  };
}

export function normalizePathInput(raw: string, cwd: string): string {
  const unquoted = raw.trim().replace(/^(["'])(.*)\1$/, '$2');
  return path.resolve(cwd, unquoted);
}

async function askDirectory(deps: CollectDeps): Promise<string> {
  for (;;) {
    const answer = await deps.prompter.ask(`项目路径（回车使用当前目录 ${deps.cwd}）：`);
    const candidate = normalizePathInput(answer, deps.cwd);
    try {
      assertDirectory(candidate);
      return candidate;
    } catch (error) {
      deps.log((error as Error).message);
    }
  }
}

async function askId(dir: string, deps: CollectDeps): Promise<string> {
  const fallback = slugifyId(path.basename(dir));
  const question = fallback
    ? `启动 id（回车使用 ${fallback}）：`
    : '启动 id（目录名无法自动生成，必填）：';

  for (;;) {
    const candidate = (await deps.prompter.ask(question)).trim() || fallback;
    if (!candidate) {
      deps.log('id 不能为空');
    } else if (!isValidId(candidate)) {
      deps.log('id 只能包含小写字母、数字、- 和 _，且不能以符号开头');
    } else if (deps.existingIds.includes(candidate)) {
      deps.log(`id 已存在：${candidate}`);
    } else {
      return candidate;
    }
  }
}

async function askStart(dir: string, deps: CollectDeps): Promise<string | undefined> {
  const suggestion = probeStart(dir);
  if (suggestion) deps.log(`探测：${suggestion.reason}`);

  const hint = suggestion ? `（回车使用 ${suggestion.value}，- 表示不设置）` : '（回车跳过）';
  const answer = (await deps.prompter.ask(`启动命令或脚本${hint}：`)).trim();
  if (answer === '-') return undefined;
  return answer || suggestion?.value;
}

// Asks only for what the seed lacks, so flags given on the command line are never re-asked.
export async function collectAddInput(seed: Partial<AddLaunchInput>, deps: CollectDeps): Promise<AddLaunchInput> {
  let dir: string;
  if (seed.path !== undefined) {
    dir = normalizePathInput(seed.path, deps.cwd);
    assertDirectory(dir);
  } else {
    dir = await askDirectory(deps);
  }

  const start = seed.start !== undefined ? seed.start : await askStart(dir, deps);
  const id = seed.id !== undefined ? seed.id : await askId(dir, deps);

  let name = seed.name;
  if (name === undefined) {
    const answer = (await deps.prompter.ask(`显示名（回车使用 ${path.basename(dir)}）：`)).trim();
    name = answer || undefined;
  }

  return { path: dir, id, name, start, kind: seed.kind, shell: seed.shell, keepOpen: seed.keepOpen };
}
