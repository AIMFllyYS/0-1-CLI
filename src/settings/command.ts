import chalk from 'chalk';
import type { Command } from 'commander';
import { formatSettingsList } from './format';
import { findSettingDef } from './schema';
import { getSetting, loadSettings, resetSetting, updateSetting } from './store';

function fail(error: unknown): never {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}

function printValue(value: boolean | number | string): string {
  return String(value);
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('查看和修改 hi 的设置（CLI 与桌面端共用）');

  config
    .command('list')
    .description('列出全部设置')
    .option('--json', '以 JSON 输出')
    .action((opts: { json?: boolean }) => {
      console.log(formatSettingsList(loadSettings(), { json: Boolean(opts.json) }));
    });

  config
    .command('get <key>')
    .description('读取单个设置的当前值')
    .action((key: string) => {
      try {
        findSettingDef(key);
        console.log(printValue(getSetting(key)));
      } catch (error) {
        fail(error);
      }
    });

  config
    .command('set <key> <value>')
    .description('修改设置，例如 hi config set github.prefetch off')
    .action((key: string, value: string) => {
      try {
        const result = updateSetting(key, value);
        console.log(chalk.green(`✓ ${result.key} = ${printValue(result.value)}`));
        if (result.warning) console.log(chalk.yellow(`! ${result.warning}`));
      } catch (error) {
        fail(error);
      }
    });

  config
    .command('reset [key]')
    .description('恢复默认值；不带 key 则恢复全部')
    .action((key: string | undefined) => {
      try {
        resetSetting(key);
        console.log(chalk.green(key ? `✓ 已恢复 ${key} 的默认值` : '✓ 已恢复全部默认设置'));
      } catch (error) {
        fail(error);
      }
    });
}
