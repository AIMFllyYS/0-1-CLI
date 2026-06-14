import chalk from 'chalk';

interface CliTool {
  name: string;
  command: string;
  autoCmd: string;
  autoDesc: string;
  commands: { cmd: string; desc: string }[];
}

const CLI_TOOLS: CliTool[] = [
  {
    name: 'Claude Code',
    command: 'claude',
    autoCmd: 'claude chat --no-interactive --dangerously-skip-permissions {TASK}',
    autoDesc: 'Auto 运行（非交互模式）',
    commands: [
      { cmd: '-p "prompt"', desc: '非交互模式，直接执行 prompt' },
      { cmd: '--model sonnet', desc: '指定模型（sonnet/opus/haiku）' },
      { cmd: '--model opus', desc: '指定 Opus 模型' },
      { cmd: '--resume [session-id]', desc: '恢复指定会话' },
      { cmd: '-c', desc: '继续最近会话' },
      { cmd: '--continue', desc: '继续最近会话（完整写法）' },
      { cmd: '--worktree [name]', desc: '创建 git worktree' },
      { cmd: '--permission-mode bypassPermissions', desc: '绕过所有权限确认' },
      { cmd: '--dangerously-skip-permissions', desc: '跳过权限检查（CI/CD 用）' },
      { cmd: '--no-session-persistence', desc: '不保存会话' },
      { cmd: '--output-format json', desc: 'JSON 输出格式' },
      { cmd: '--max-budget-usd 10', desc: '限制 API 花费' },
      { cmd: 'auth', desc: '管理认证流程（状态、切换、凭据）' },
      { cmd: 'mcp', desc: 'MCP 服务器配置' },
      { cmd: 'agents', desc: '列出配置的 agents' },
      { cmd: 'doctor', desc: '健康检查' },
      { cmd: 'install [stable|latest]', desc: '安装 Claude Code' },
      { cmd: 'update', desc: '检查并安装更新' },
    ]
  },
  {
    name: 'Kiro',
    command: 'kiro-cli',
    autoCmd: 'kiro-cli chat --no-interactive --trust-all-tools {TASK}',
    autoDesc: 'Auto 运行（非交互模式）',
    commands: [
      { cmd: 'chat', desc: '交互模式聊天' },
      { cmd: 'chat --no-interactive --trust-all-tools "task"', desc: '非交互模式执行任务' },
      { cmd: 'agent', desc: '管理 agents' },
      { cmd: 'auth sign-in', desc: '打开 Kiro 认证流程' },
      { cmd: 'auth sign-out', desc: '退出 Kiro 认证状态' },
      { cmd: 'whoami', desc: '显示当前登录信息' },
      { cmd: 'profile', desc: '显示用户 profile' },
      { cmd: 'settings', desc: '自定义外观和行为' },
      { cmd: 'diagnostic', desc: '运行诊断测试' },
      { cmd: 'issue', desc: '创建 GitHub issue' },
      { cmd: 'mcp', desc: 'MCP 配置' },
      { cmd: 'update', desc: '检查并安装更新' },
      { cmd: '--tui', desc: 'TUI 模式启动' },
      { cmd: '--legacy-ui', desc: '旧版 UI 模式' },
    ]
  },
  {
    name: 'Codex',
    command: 'codex',
    autoCmd: 'codex --standalone {TASK}',
    autoDesc: 'Auto 运行（独立模式）',
    commands: [
      { cmd: 'exec -p "prompt"', desc: '非交互执行' },
      { cmd: 'review <file>', desc: '代码审查' },
      { cmd: 'auth sign-in', desc: '打开 Codex 认证流程' },
      { cmd: 'auth sign-out', desc: '退出 Codex 认证状态' },
      { cmd: 'mcp', desc: 'MCP 服务器配置' },
      { cmd: 'mcp-server', desc: '启动 Codex MCP 服务器' },
      { cmd: 'sandbox "command"', desc: '在沙箱中运行命令' },
      { cmd: 'apply', desc: '应用最新 diff' },
      { cmd: 'resume', desc: '恢复上一个会话' },
      { cmd: 'fork', desc: '叉一个会话' },
      { cmd: 'cloud', desc: '浏览 Codex Cloud 任务' },
      { cmd: 'features', desc: '查看功能开关' },
    ]
  },
  {
    name: 'Gemini',
    command: 'gemini',
    autoCmd: 'gemini {TASK}',
    autoDesc: 'Auto 运行（默认交互，可用 -p 非交互）',
    commands: [
      { cmd: '"query"', desc: '交互模式执行查询' },
      { cmd: '-p "prompt"', desc: '非交互模式（headless）' },
      { cmd: '-i "prompt"', desc: '执行后继续交互模式' },
      { cmd: '--model <name>', desc: '指定模型' },
      { cmd: '--approval-mode yolo', desc: '自动批准所有操作（YOLO 模式）' },
      { cmd: '--approval-mode auto_edit', desc: '自动批准编辑工具' },
      { cmd: '--approval-mode plan', desc: '只读模式' },
      { cmd: '--sandbox', desc: '沙箱模式运行' },
      { cmd: '-w [name]', desc: '创建 git worktree' },
      { cmd: '--resume latest', desc: '恢复最近会话' },
      { cmd: '--list-sessions', desc: '列出会话列表' },
      { cmd: '--delete-session <id>', desc: '删除指定会话' },
      { cmd: '--include-directories <path>', desc: '包含额外目录' },
      { cmd: '-l, --list-extensions', desc: '列出所有扩展' },
      { cmd: '--output-format json', desc: 'JSON 输出格式' },
      { cmd: 'mcp', desc: 'MCP 服务器管理' },
      { cmd: 'extensions <command>', desc: '扩展管理（install/remove/list）' },
      { cmd: 'skills <command>', desc: '技能管理' },
      { cmd: 'hooks <command>', desc: '钩子管理' },
    ]
  },
  {
    name: 'Cursor',
    command: 'cursor',
    autoCmd: 'cursor --no-install {TASK}',
    autoDesc: 'Auto 运行',
    commands: [
      { cmd: '.', desc: '在当前目录打开 Cursor' },
      { cmd: '<file>', desc: '打开指定文件' },
      { cmd: '--no-install', desc: '不自动安装/更新' },
      { cmd: '--dir <path>', desc: '打开指定目录' },
    ]
  }
];

export function getCliCommands(task?: string | null): string {
  const taskStr = task || 'Your task here';

  let output = '';

  for (const cli of CLI_TOOLS) {
    const cmd = cli.autoCmd.replace('{TASK}', `"${taskStr}"`);
    output += chalk.cyan(`  ${cli.name}:`) + chalk.white(` ${cli.command}\n`);
    output += chalk.gray(`    ${cmd}\n\n`);
  }

  output += chalk.bold('\n💡 Quick Tips:\n');
  output += chalk.gray('  - Use --no-interactive / -p for automated runs\n');
  output += chalk.gray('  - Use --trust-all-tools / --dangerously-skip-permissions for full access\n');
  output += chalk.gray('  - Combine with --model to specify AI model\n');
  output += chalk.gray('  - Add --output-format json for machine-readable output\n');

  return output;
}

export function getCliByTool(tool: string, task?: string | null): string {
  const cliMap: Record<string, CliTool> = {};
  for (const cli of CLI_TOOLS) {
    cliMap[cli.name.toLowerCase()] = cli;
    cliMap[cli.command.toLowerCase()] = cli;
  }

  const normalized = tool.toLowerCase();
  const selected = cliMap[normalized];

  if (!selected) {
    return chalk.red(`Unknown CLI tool: ${tool}\n`) +
           chalk.gray(`Available: ${CLI_TOOLS.map(c => c.name).join(', ')}\n`);
  }

  const taskStr = task || 'Your task here';

  let output = '';
  output += chalk.bold.cyan(`\n╔══════════════════════════════════════════════════════════════╗\n`);
  output += chalk.bold.cyan(`║  ${selected.name} (${selected.command})                              ║\n`);
  output += chalk.bold.cyan(`╚══════════════════════════════════════════════════════════════╝\n\n`);

  // Auto 运行指令
  output += chalk.bold.green('⚡ Auto 运行指令:\n');
  const autoCmd = selected.autoCmd.replace('{TASK}', `"${taskStr}"`);
  output += chalk.white(`  ${autoCmd}\n\n`);

  // 常用命令列表
  output += chalk.bold.yellow(`📋 常用命令:\n`);
  for (const cmd of selected.commands) {
    output += chalk.cyan(`  ${selected.command} ${cmd.cmd}`) + chalk.gray(`\n    ${cmd.desc}\n`);
  }

  return output;
}
