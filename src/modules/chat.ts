import chalk from 'chalk';
import * as readline from 'readline';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEFAULT_MODEL = 'deepseek-chat';

const CONFIG_PATH = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.coding-cli.json');

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getSystemPrompt(): string {
  const cwd = process.cwd().replace(/\\/g, '/');
  let projects = 'Unknown';

  try {
    let root = 'C:/project';
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.projectRoot) root = config.projectRoot;
    } catch {}
    const entries = fs.readdirSync(root, { withFileTypes: true });
    projects = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .join(', ');
  } catch {}

  return [
    '你是 Coding CLI 的 AI 助手，运行在只读模式下。',
    '',
    '## 核心约束',
    '1. **禁止任何编辑操作**：不允许创建、修改、删除、复制、重命名任何文件',
    '2. **禁止执行危险命令**：不允许运行 rm, del, format 等危险操作',
    '3. **仅可使用以下工具（用户会替你执行）：',
    '   - ls / dir：列出目录内容',
    '   - Read：读取文件内容',
    '   - Grep：在文件中搜索内容',
    '   - WebSearch：进行网络搜索',
    '',
    '## 你的能力',
    '- 解释代码结构和项目组织',
    '- 分析文件内容和代码逻辑',
    '- 提供编程建议和调试帮助',
    '- 回答技术问题',
    '- 搜索网络获取信息',
    '',
    '## 当前环境',
    '- 工作目录：C:/project',
    '- 项目列表：' + projects,
    '- 当前目录：' + cwd,
    '',
    '## 输出格式要求',
    '- 使用中文回答',
    '- 结构化输出，使用 emoji 增加可读性',
    '- 代码块使用 ``` 包裹',
    '- 重要信息用 **粗体** 强调',
    '',
    '## 对话格式',
    '用户输入问题 -> 分析需求 -> 如需工具则说明要使用的工具 -> 给出回答',
    '用户输入 exit/quit/bye 结束对话。'
  ].join('\n');
}

function callDeepSeekAPI(messages: Message[], model: string = DEFAULT_MODEL): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: model,
      messages: messages,
      stream: false,
      max_tokens: 4096
    });

    const options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'API Error'));
            return;
          }
          resolve(parsed.choices?.[0]?.message?.content || '');
        } catch (e) {
          reject(new Error('Failed to parse API response'));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function executeTool(command: string): Promise<string> {
  const trimmed = command.trim().toLowerCase();

  // ls / dir command
  if (trimmed.startsWith('ls ') || trimmed.startsWith('dir ') || trimmed === 'ls' || trimmed === 'dir') {
    const target = trimmed.includes(' ') ? trimmed.split(' ')[1] : '.';
    try {
      const cwd = process.cwd();
      const result = execSync('ls -la "' + target + '"', { cwd, encoding: 'utf-8', timeout: 10000 });
      return result;
    } catch (e: any) {
      return 'Error: ' + e.message;
    }
  }

  // Read command
  if (trimmed.startsWith('read ') || trimmed.startsWith('cat ') || trimmed.startsWith('type ')) {
    const parts = command.trim().split(/\s+/);
    const filename = parts.slice(1).join(' ');
    if (!filename) return 'Error: No filename specified';
    try {
      const cwd = process.cwd();
      const filepath = path.isAbsolute(filename) ? filename : path.join(cwd, filename);
      const content = fs.readFileSync(filepath, 'utf-8');
      // Limit to first 200 lines
      const lines = content.split('\n').slice(0, 200);
      let result = lines.join('\n');
      if (content.split('\n').length > 200) {
        result += '\n... (truncated, showing first 200 lines)';
      }
      return result;
    } catch (e: any) {
      return 'Error reading file: ' + e.message;
    }
  }

  // Grep command (simple implementation)
  if (trimmed.startsWith('grep ') || trimmed.startsWith('rg ')) {
    try {
      const cwd = process.cwd();
      const result = execSync(command, { cwd, encoding: 'utf-8', timeout: 10000 });
      return result;
    } catch (e: any) {
      return 'Error: ' + e.message;
    }
  }

  // WebSearch command
  if (trimmed.startsWith('websearch ') || trimmed.startsWith('search ') || trimmed.startsWith('bing ')) {
    const query = command.trim().split(/\s+/).slice(1).join(' ');
    if (!query) return 'Error: No search query specified';
    return '[WebSearch] 搜索: ' + query + '\n(实际搜索需要通过 AI API 实现)';
  }

  return 'Unknown tool: ' + command + '\nAvailable tools: ls, dir, Read, Grep, WebSearch';
}

export async function startChat(model?: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const messages: Message[] = [
    { role: 'system', content: getSystemPrompt() }
  ];

  const promptQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(chalk.cyan('\n> '), (answer) => {
        resolve(answer);
      });
    });
  };

  console.log(chalk.bold.cyan(''));
  console.log(chalk.bold.cyan('+------------------------------------------------------------+'));
  console.log(chalk.bold.cyan('|') + chalk.bold.white('            Coding AI (Read-only Mode)               ') + chalk.bold.cyan('|'));
  console.log(chalk.bold.cyan('+------------------------------------------------------------+'));
  console.log(chalk.gray('  模型: ' + (model || DEFAULT_MODEL)));
  console.log(chalk.gray('  输入问题或命令，或 \'exit\' 退出\n'));
  console.log(chalk.bold.cyan('------------------------------------------------------------'));

  while (true) {
    const userInput = await promptQuestion('');

    if (!userInput.trim()) continue;

    const lowerInput = userInput.toLowerCase().trim();
    if (lowerInput === 'exit' || lowerInput === 'quit' || lowerInput === 'bye' || lowerInput === 'q') {
      console.log(chalk.green('\n👋 对话结束！\n'));
      break;
    }

    // Check if input looks like a tool command
    const isToolCommand = lowerInput.match(/^(ls|dir|read|cat|type|grep|rg|websearch|search|bing)\s/i);

    if (isToolCommand) {
      // Directly execute tool command
      console.log(chalk.gray('\n🔧 执行工具...\n'));
      try {
        const result = await executeTool(userInput);
        console.log(chalk.white(result));
        console.log(chalk.gray('\n(以上为工具执行结果)\n'));
      } catch (e: any) {
        console.log(chalk.red('Error: ' + e.message));
      }
      continue;
    }

    // Add user message
    messages.push({ role: 'user', content: userInput });

    // Call API
    console.log(chalk.gray('\n🤔 AI 思考中...\n'));

    try {
      const response = await callDeepSeekAPI(messages, model || DEFAULT_MODEL);
      messages.push({ role: 'assistant', content: response });
      console.log(chalk.white(response));
    } catch (e: any) {
      console.log(chalk.red('❌ API 错误: ' + e.message));
      // Remove failed message
      messages.pop();
    }
  }

  rl.close();
}
