import chalk from 'chalk';
import type { Command } from 'commander';
import { interactiveSelect } from '../../utils/selector';
import { collectAddInput, createPrompter, normalizePathInput, PromptCancelled } from './interactive';
import { addLaunch, findLaunch, formatLaunchList, listLaunch, removeLaunch } from './registry';
import type { AddLaunchInput } from './registry';
import { launchEntry, planLaunch } from './terminal';

function renderPathHelp(): string {
  return [
    '用法：hi path <子命令>',
    '',
    '注册常用项目路径和启动方式',
    '',
    '子命令：',
    '  list [--json]                     列出已注册的路径',
    '  add [路径] [选项]                  注册一个路径（省略路径或加 -i 进入交互模式）',
    '  show <id>                         查看单个注册项',
    '  rm <id>                           删除注册项',
    '',
    'add 选项：',
    '  --id <id>                         启动 id（默认取目录名，小写字母/数字/-/_）',
    '  --name <名称>                      显示名（默认取目录名）',
    '  --start <命令或脚本>               启动命令，或项目内的 .cmd/.bat/.ps1 脚本',
    '  --cmd                             强制把 --start 当作命令',
    '  --script                          强制把 --start 当作脚本文件',
    '  --shell <cmd|powershell>          指定 shell（.ps1 脚本默认 powershell，其余 cmd）',
    '  --close                           命令结束后不保留窗口（默认保留）',
    '  -i, --interactive                 逐项提问，并根据目录内容预填启动方式',
    '',
  ].join('\n');
}

function fail(error: unknown): never {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}

export function registerPathCommands(program: Command): void {
  const pathCommand = program
    .command('path')
    .description('注册常用项目路径和启动方式')
    .configureHelp({ formatHelp: renderPathHelp })
    .helpOption('-h, --help', '显示帮助信息')
    .action(() => {
      process.stdout.write(renderPathHelp());
    });

  pathCommand
    .command('list')
    .description('列出已注册的路径')
    .option('--json', '以 JSON 输出')
    .action((opts: { json?: boolean }) => {
      try {
        console.log(formatLaunchList(listLaunch(), { json: Boolean(opts.json) }));
      } catch (error) {
        fail(error);
      }
    });

  pathCommand
    .command('add [path]')
    .description('注册一个路径')
    .option('--id <id>')
    .option('--name <name>')
    .option('--start <way>')
    .option('--cmd')
    .option('--script')
    .option('--shell <shell>')
    .option('--close')
    .option('-i, --interactive')
    .action(async (target: string | undefined, opts: {
      id?: string;
      name?: string;
      start?: string;
      cmd?: boolean;
      script?: boolean;
      shell?: string;
      close?: boolean;
      interactive?: boolean;
    }) => {
      try {
        if (opts.cmd && opts.script) {
          throw new Error('--cmd 和 --script 不能同时使用');
        }
        if ((opts.cmd || opts.script) && opts.start === undefined && !opts.interactive) {
          throw new Error('--cmd / --script 需要配合 --start 使用');
        }

        const seed: Partial<AddLaunchInput> = {
          path: target === undefined ? undefined : normalizePathInput(target, process.cwd()),
          id: opts.id,
          name: opts.name,
          start: opts.start,
          kind: opts.cmd ? 'command' : opts.script ? 'script' : undefined,
          shell: opts.shell,
          keepOpen: opts.close ? false : undefined,
        };

        const wantsPrompt = Boolean(opts.interactive) || (target === undefined && Boolean(process.stdin.isTTY));
        let input: AddLaunchInput;
        if (wantsPrompt) {
          const prompter = createPrompter(process.stdin, process.stdout);
          try {
            input = await collectAddInput(seed, {
              prompter,
              existingIds: listLaunch().map((item) => item.id),
              cwd: process.cwd(),
              log: (message) => console.log(chalk.yellow(message)),
            });
          } finally {
            prompter.close();
          }
        } else if (seed.path === undefined) {
          throw new Error('请提供路径：hi path add <路径>，或加 -i 进入交互模式');
        } else {
          input = seed as AddLaunchInput;
        }

        const { entry, warnings } = addLaunch(input);
        for (const warning of warnings) console.log(chalk.yellow(`! ${warning}`));
        console.log(chalk.green(`✓ 已注册 ${entry.id}`) + chalk.gray(`  ${entry.path}`));
      } catch (error) {
        if (error instanceof PromptCancelled) {
          console.error(chalk.yellow('\n已取消，未保存。'));
          process.exit(1);
        }
        fail(error);
      }
    });

  pathCommand
    .command('show <id>')
    .description('查看单个注册项')
    .action((id: string) => {
      try {
        const entry = findLaunch(id);
        if (!entry) throw new Error(`未找到 id：${id}`);
        console.log(JSON.stringify(entry, null, 2));
      } catch (error) {
        fail(error);
      }
    });

  pathCommand
    .command('rm <id>')
    .description('删除注册项')
    .action((id: string) => {
      try {
        const removed = removeLaunch(id);
        console.log(chalk.green(`✓ 已删除 ${removed.id}`));
      } catch (error) {
        fail(error);
      }
    });
}

async function pickId(): Promise<string | undefined> {
  const entries = listLaunch();
  if (entries.length === 0) {
    throw new Error('还没有注册任何路径。用 `hi path add <路径> --start <命令或脚本>` 添加。');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`请指定 id：hi run <id>（可用：${entries.map((item) => item.id).join(', ')}）`);
  }

  let selected: string | undefined;
  await interactiveSelect({
    title: '选择要启动的路径',
    options: entries.map((item) => ({
      label: item.id,
      value: item.id,
      description: `${item.name}  ${item.start ? item.start.value : item.path}`,
    })),
    onSelect: (value) => {
      selected = value;
    },
    onCancel: () => {
      console.log(chalk.yellow('已取消。'));
    },
  });
  return selected;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run [id]')
    .description('在新终端中于项目目录下执行启动命令')
    .option('--dry-run', '只打印将执行的终端命令，不打开窗口')
    .action(async (id: string | undefined, opts: { dryRun?: boolean }) => {
      try {
        const targetId = id ?? await pickId();
        if (!targetId) return;

        const entries = listLaunch();
        const entry = entries.find((item) => item.id === targetId);
        if (!entry) {
          const available = entries.map((item) => item.id).join(', ') || '（空）';
          throw new Error(`未找到 id：${targetId}（可用：${available}）`);
        }

        if (opts.dryRun) {
          console.log(JSON.stringify(planLaunch(entry), null, 2));
          return;
        }

        const { terminal } = await launchEntry(entry);
        const via = terminal === 'wt' ? 'Windows Terminal' : 'cmd';
        console.log(chalk.green(`✓ 已在新窗口启动 ${entry.id}`) + chalk.gray(`  (${via}, ${entry.path})`));
      } catch (error) {
        fail(error);
      }
    });
}
