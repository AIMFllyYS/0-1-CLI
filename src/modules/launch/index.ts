import chalk from 'chalk';
import type { Command } from 'commander';
import { addLaunch, findLaunch, formatLaunchList, listLaunch, removeLaunch } from './registry';

function renderPathHelp(): string {
  return [
    '用法：hi path <子命令>',
    '',
    '注册常用项目路径和启动方式',
    '',
    '子命令：',
    '  list [--json]                     列出已注册的路径',
    '  add <路径> [选项]                  注册一个路径',
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
    .command('add <path>')
    .description('注册一个路径')
    .option('--id <id>')
    .option('--name <name>')
    .option('--start <way>')
    .option('--cmd')
    .option('--script')
    .option('--shell <shell>')
    .option('--close')
    .action((target: string, opts: {
      id?: string;
      name?: string;
      start?: string;
      cmd?: boolean;
      script?: boolean;
      shell?: string;
      close?: boolean;
    }) => {
      try {
        if (opts.cmd && opts.script) {
          throw new Error('--cmd 和 --script 不能同时使用');
        }
        if ((opts.cmd || opts.script) && !opts.start) {
          throw new Error('--cmd / --script 需要配合 --start 使用');
        }
        const { entry, warnings } = addLaunch({
          path: target,
          id: opts.id,
          name: opts.name,
          start: opts.start,
          kind: opts.cmd ? 'command' : opts.script ? 'script' : undefined,
          shell: opts.shell,
          keepOpen: opts.close ? false : undefined,
        });
        for (const warning of warnings) console.log(chalk.yellow(`! ${warning}`));
        console.log(chalk.green(`✓ 已注册 ${entry.id}`) + chalk.gray(`  ${entry.path}`));
      } catch (error) {
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
