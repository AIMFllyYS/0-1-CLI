#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Import modules
import { displayAccounts, interactiveSwitch, getGhAuthCommands, getGitHubInfo } from './modules/github';
import { getProjectPaths, ensureProjectRoot } from './modules/paths';
import { getCliCommands, getCliByTool } from './modules/cli';
import { getApps } from './modules/apps';
import { startChat } from './modules/chat';

const program = new Command();

program
  .name('coding')
  .description('My-Windows-CLI - Project paths, GitHub status, CLI commands, AI chat')
  .version('2.0.0')
  // Basic info options
  .option('-s, --short', 'Short output (key info only)')
  .option('-p, --paths', 'Show project paths only')
  .option('-a, --apps', 'Show app launch commands only')
  // GitHub options
  .option('-g, --gh', 'Show GitHub accounts and issues')
  .option('--gh-accounts', 'Show GitHub accounts only')
  .option('--gh-switch', 'Interactive GitHub account switcher')
  .option('--gh-issues', 'Show GitHub issues only')
  // CLI reference options
  .option('-c, --cli <tool>', 'Show CLI commands (cc/kiro/codex/gemini/cursor/all)')
  .option('-t, --task <description>', 'Task description for CLI command generation')
  // AI chat options
  .option('-C, --chat', 'Start AI chat mode (interactive)')
  .option('-A, --ai', 'Start AI chat mode (alias for --chat)')
  .option('-m, --model <model>', 'AI model (default: deepseek-chat)')
  // Action handler
  .action(async (opts) => {
    // AI Chat mode (takes priority)
    if (opts.chat || opts.ai) {
      await startChat(opts.model);
      return;
    }

    // GitHub account switcher
    if (opts.ghSwitch) {
      await interactiveSwitch();
      return;
    }

    // GitHub accounts only
    if (opts.ghAccounts) {
      displayAccounts();
      return;
    }

    // GitHub issues only
    if (opts.ghIssues) {
      await getGitHubInfo({ showAccounts: false, showIssues: true });
      return;
    }

    // GitHub full info
    if (opts.gh) {
      console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold.cyan('║                    🐙 GitHub Status                         ║'));
      console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝\n'));
      await getGitHubInfo({ showAccounts: true, showIssues: true });
      return;
    }

    // CLI reference
    if (opts.cli) {
      const toolMap: Record<string, string> = {
        '-cc': 'claude', 'cc': 'claude',
        '-kiro': 'kiro', 'kiro': 'kiro',
        '-codex': 'codex', 'codex': 'codex',
        '-gemini': 'gemini', 'gemini': 'gemini',
        '-cursor': 'cursor', 'cursor': 'cursor'
      };
      const tool = toolMap[opts.cli] || opts.cli;
      if (tool === 'all') {
        console.log(chalk.bold('\n=== ⚡ CLI Auto Commands ===\n'));
        console.log(getCliCommands(opts.task));
      } else {
        console.log(chalk.bold(`\n=== ${tool.toUpperCase()} CLI ===\n`));
        console.log(getCliByTool(tool, opts.task));
      }
      return;
    }

    // Project paths only
    if (opts.paths) {
      const root = await ensureProjectRoot();
      console.log(chalk.bold('\n📁 Project Paths\n'));
      console.log(getProjectPaths(root));
      return;
    }

    // Apps only
    if (opts.apps) {
      console.log(chalk.bold('\n🚀 App Launch Commands\n'));
      console.log(getApps());
      return;
    }

    // Full output
    console.log(chalk.bold.cyan(`
╔══════════════════════════════════════════════════════════════╗
║               🤖 My-Windows-CLI v2.0.0                    ║
╚══════════════════════════════════════════════════════════════╝
    `));

    // 0. Ensure project root is configured
    const projectRoot = await ensureProjectRoot();

    // 1. GitHub Status
    console.log(chalk.bold('\n🐙 GitHub Status'));
    await getGitHubInfo({ showAccounts: true, showIssues: true });

    // 2. Project Paths
    console.log(chalk.bold('\n📁 Project Paths'));
    console.log(getProjectPaths(projectRoot));

    // 3. CLI Commands
    console.log(chalk.bold('\n⚡ CLI Auto Commands'));
    console.log(getCliCommands(opts.task));

    // 4. App Launch
    console.log(chalk.bold('\n🚀 App Launch Commands'));
    console.log(getApps());

    // Help footer
    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║  Usage: coding [options]                                       ║'));
    console.log(chalk.bold.cyan('╠══════════════════════════════════════════════════════════════╣'));
    console.log(chalk.bold.cyan('║  --gh          GitHub accounts + issues                       ║'));
    console.log(chalk.bold.cyan('║  --gh-accounts  GitHub accounts only                        ║'));
    console.log(chalk.bold.cyan('║  --gh-switch   Interactive account switcher                 ║'));
    console.log(chalk.bold.cyan('║  --gh-issues   Issues only                                 ║'));
    console.log(chalk.bold.cyan('║  --paths       Project paths only                          ║'));
    console.log(chalk.bold.cyan('║  --apps        App launch commands                          ║'));
    console.log(chalk.bold.cyan('║  --cli <tool>  CLI commands (cc/kiro/codex/gemini/cursor) ║'));
    console.log(chalk.bold.cyan('║  --chat        AI chat mode                                ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝\n'));
  });

program.parse(process.argv);
