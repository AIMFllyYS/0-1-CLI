import * as readline from 'readline';
import chalk from 'chalk';
import { ChatMessage, ModelInfo } from '../types';
import { MODELS, DEFAULT_MODEL_ID, getAvailableModels, getModelById } from './models';
import { streamChat } from './provider';
import { webSearch } from './search';
import { executeTool, getSystemPrompt, isToolCommand } from './tools';
import { Spinner, drawBox, printSuccess, printError, printInfo, printWarning, printDivider, StreamRenderer } from './renderer';
import { interactiveSelect } from '../utils/selector';
import { parseAiEnv, resolveEnvPath, writeAiSettings } from './config';
import { parseSlashCommand, resolveModelCommand } from './commands';
import { createInterruptController, createPendingInputController } from './interrupts';
import { resolveModeCommand } from './modes';
import { AiSessionState, createSessionState, setCurrentModel, setMode } from './session';
import { ActiveRuntimeSkill, discoverRuntimeSkills, formatSkillContextMessage, formatSkillList, loadRuntimeSkillContent, resolveSkillSelection, RuntimeSkill, trimMessagesPreservingSkillContext, upsertSkillContextMessage } from './skills';

const AI_SESSION_EXIT = '__HI_AI_SESSION_EXIT__';

export interface StartChatOptions {
  modelId?: string;
  autoAccept?: boolean;
}

export async function startChat(options?: string | StartChatOptions): Promise<void> {
  const startOptions = typeof options === 'string' ? { modelId: options } : (options || {});
  const session = createSessionState({ modelId: startOptions.modelId || DEFAULT_MODEL_ID, autoAccept: startOptions.autoAccept });
  let currentModel = getModelById(session.currentModelId) || MODELS[0];
  const runtimeSkills = discoverRuntimeSkills();
  const activeSkills = (): ActiveRuntimeSkill[] => runtimeSkills
    .filter((skill) => session.activeSkillIds.includes(skill.id))
    .map((skill) => loadRuntimeSkillContent(skill));
  const syncSkillContext = (): void => upsertSkillContextMessage(messages, formatSkillContextMessage(activeSkills()));
  const messages: ChatMessage[] = [{ role: 'system', content: getSystemPrompt() }];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pendingInput = createPendingInputController();
  const ask = (): Promise<string> => pendingInput.wait((resolve) => rl.question(chalk.cyan('\n  ❯ '), resolve));
  const askPrompt = async (prompt: string): Promise<string> => {
    const answer = await pendingInput.wait((resolve) => rl.question(prompt, resolve));
    if (shouldExit) throw new Error(AI_SESSION_EXIT);
    return answer;
  };
  const interruptController = createInterruptController({ confirmWindowMs: 1200 });
  let isRunning = false;
  let shouldExit = false;
  let activeCancel: (() => void) | null = null;
  const handleInterrupt = (source: 'Ctrl+C' | 'Esc') => {
    const result = interruptController.handle({ running: isRunning, inSubmenu: session.inSubmenu });
    if (result.action === 'back') {
      return;
    }
    if (result.action === 'cancel-running') {
      activeCancel?.();
      activeCancel = null;
      isRunning = false;
      printWarning('已请求取消当前操作');
      return;
    }
    if (result.action === 'exit') {
      shouldExit = true;
      pendingInput.resolveOnExit();
      return;
    }
    printWarning(`再次按 ${source} 退出 AI 会话`);
  };
  const onSigint = () => {
    handleInterrupt('Ctrl+C');
  };
  const onKeypress = (_str: string | undefined, key: readline.Key) => {
    if (key?.ctrl && key.name === 'c') handleInterrupt('Ctrl+C');
    if (key?.name === 'escape') handleInterrupt('Esc');
  };
  const wasRaw = process.stdin.isRaw;
  readline.emitKeypressEvents(process.stdin, rl);
  process.stdin.setRawMode?.(true);
  process.on('SIGINT', onSigint);
  process.stdin.on('keypress', onKeypress);
  const runSearch = async (query: string, searchMessages: ChatMessage[], model: ModelInfo): Promise<void> => {
    const searchAbort = new AbortController();
    isRunning = true;
    activeCancel = () => searchAbort.abort();
    try {
      await doSearch(query, searchMessages, model, searchAbort.signal, (cancel) => {
        activeCancel = cancel;
      });
    } finally {
      activeCancel = null;
      isRunning = false;
    }
  };
  const hooks: RuntimeHooks = { askLine: askPrompt, runSearch, runtimeSkills, syncSkillContext };

  // Welcome banner
  console.log('\n' + drawBox(
    '🤖 Coding AI Chat',
    `${session.mode} / ${session.permissionMode} · ${currentModel.name}`
  ));
  console.log('');
  printInfo('输入问题开始对话，输入 /help 查看命令');
  printDivider();

  try {
  while (!shouldExit) {
    const input = (await ask()).trim();
    if (!input) continue;

    // === Slash Commands ===
    if (input.startsWith('/')) {
      const handled = await handleCommand(input, currentModel, messages, session, hooks);
      if (handled === 'exit') break;
      if (handled instanceof Object && 'model' in handled) {
        currentModel = handled.model;
        setCurrentModel(session, currentModel.id);
        messages[0] = { role: 'system', content: getSystemPrompt() };
        syncSkillContext();
      }
      continue;
    }

    // === Direct Tool Commands ===
    if (isToolCommand(input)) {
      printInfo('执行工具...');
      isRunning = true;
      let result = '';
      try {
        result = await executeTool(input);
      } finally {
        isRunning = false;
      }
      console.log(chalk.gray('\n  ┌── 工具结果 ──'));
      result.split('\n').forEach(l => console.log(chalk.gray('  │ ') + chalk.white(l)));
      console.log(chalk.gray('  └' + '─'.repeat(40)));
      continue;
    }

    // === Web Search (prefix: search / 搜索) ===
    if (/^(search|搜索)\s+/i.test(input)) {
      const query = input.replace(/^(search|搜索)\s+/i, '');
      await runSearch(query, messages, currentModel);
      continue;
    }

    // === AI Chat ===
    messages.push({ role: 'user', content: input });
    isRunning = true;
    try {
      await streamAIResponse(messages, currentModel, (cancel) => {
        activeCancel = cancel;
      });
    } finally {
      activeCancel = null;
      isRunning = false;
    }
  }

  } finally {
  process.removeListener('SIGINT', onSigint);
  process.stdin.removeListener('keypress', onKeypress);
  if (!wasRaw) process.stdin.setRawMode?.(false);
  rl.close();
  }
}

// === Slash Command Handler ===

interface CommandResult {
  model: ModelInfo;
}

interface RuntimeHooks {
  askLine: (prompt: string) => Promise<string>;
  runSearch: (query: string, messages: ChatMessage[], model: ModelInfo) => Promise<void>;
  runtimeSkills: RuntimeSkill[];
  syncSkillContext: () => void;
}

async function handleCommand(
  input: string,
  currentModel: ModelInfo,
  messages: ChatMessage[],
  session: AiSessionState,
  hooks: RuntimeHooks
): Promise<'exit' | 'continue' | CommandResult> {
  const parsed = parseSlashCommand(input);
  if (!parsed) return 'continue';
  const cmd = parsed.command;
  const args = parsed.args;
  const modeCommand = resolveModeCommand(cmd);
  if (modeCommand) {
    setMode(session, modeCommand.mode);
    printSuccess(`已切换到 ${session.mode} 模式`);
    return 'continue';
  }

  switch (cmd) {
    case '/exit':
    case '/quit':
    case '/q':
      console.log(chalk.green('\n  👋 再见！\n'));
      return 'exit';

    case '/help':
    case '/h':
      printHelp();
      return 'continue';

    case '/model':
    case '/m':
      {
        const modelCommand = resolveModelCommand(args);
        if (modelCommand.kind === 'info') {
          printModelInfo(currentModel);
          return 'continue';
        }
        if (modelCommand.kind === 'select') {
          const selected = getModelById(modelCommand.modelId);
          if (!selected) {
            printWarning('未知模型: ' + modelCommand.modelId);
            return 'continue';
          }
          if (selected.provider === 'custom') process.env.AI_MODEL = selected.id;
          printSuccess(`已切换到 ${selected.name}`);
          return { model: selected };
        }
      }
      return await switchModel(currentModel, session);

    case '/setting':
    case '/settings':
      try {
        await configureAiSettings(hooks.askLine);
      } catch (error: any) {
        if (error?.message === AI_SESSION_EXIT) return 'exit';
        throw error;
      }
      return 'continue';

    case '/skills':
      printRuntimeSkills(hooks.runtimeSkills, session.activeSkillIds);
      return 'continue';

    case '/skill':
      handleSkillCommand(args, hooks.runtimeSkills, session, hooks.syncSkillContext);
      return 'continue';

    case '/clear':
    case '/c':
      messages.length = 1; // keep system prompt
      hooks.syncSkillContext();
      printSuccess('对话已清空');
      return 'continue';

    case '/search':
    case '/s':
      if (!args) {
        printWarning('用法: /search <查询内容>');
      } else {
        await hooks.runSearch(args, messages, currentModel);
      }
      return 'continue';

    case '/info':
      printModelInfo(currentModel);
      return 'continue';

    default:
      printWarning('未知命令: ' + cmd + '，输入 /help 查看帮助');
      return 'continue';
  }
}

function printRuntimeSkills(skills: RuntimeSkill[], activeSkillIds: string[]): void {
  console.log('');
  console.log(chalk.bold.cyan('  Skills'));
  printDivider();
  console.log(formatSkillList(skills, activeSkillIds));
  console.log('');
}

function handleSkillCommand(
  args: string,
  skills: RuntimeSkill[],
  session: AiSessionState,
  syncSkillContext: () => void
): void {
  if (!args.trim()) {
    printRuntimeSkills(skills, session.activeSkillIds);
    printInfo('用法: /skill <id|name>，/skill clear');
    return;
  }

  const selection = resolveSkillSelection(args, skills);
  if (selection.kind === 'clear') {
    session.activeSkillIds = [];
    syncSkillContext();
    printSuccess('运行时 skills 已清空');
    return;
  }
  if (selection.kind === 'missing') {
    printWarning('未找到 skill: ' + selection.query);
    return;
  }

  if (!session.activeSkillIds.includes(selection.skill.id)) {
    session.activeSkillIds.push(selection.skill.id);
  }
  syncSkillContext();
  printSuccess(`已启用 skill: ${selection.skill.name}`);
}

async function configureAiSettings(askLine: (prompt: string) => Promise<string>): Promise<void> {
  const current = parseAiEnv(process.env);
  console.log('');
  console.log(chalk.bold.cyan('  AI 设置'));
  printDivider();
  const baseUrl = (await askLine(chalk.cyan(`  URL [${current.baseUrl || 'https://api.example.com/v1'}]: `))).trim() || current.baseUrl;
  const apiKey = (await askLine(chalk.cyan(`  API Key [${current.apiKey ? '已配置' : '空'}]: `))).trim() || current.apiKey;
  const modelInput = (await askLine(chalk.cyan(`  Model ID（英文逗号分隔） [${current.modelIds.join(',') || 'model-id'}]: `))).trim();
  const modelIds = (modelInput || current.modelIds.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!baseUrl || !apiKey || modelIds.length === 0) {
    printWarning('URL、API Key 和 Model ID 都不能为空');
    return;
  }

  const activeModelId = modelIds.includes(current.activeModelId) ? current.activeModelId : modelIds[0];
  writeAiSettings(resolveEnvPath(), { baseUrl, apiKey, modelIds, activeModelId });
  process.env.AI_BASE_URL = baseUrl;
  process.env.AI_API_KEY = apiKey;
  process.env.AI_MODELS = modelIds.join(',');
  process.env.AI_MODEL = activeModelId;
  printSuccess(`AI 设置已保存，当前模型 ${activeModelId}`);
}

function printHelp(): void {
  console.log('');
  console.log(chalk.bold.cyan('  📖 命令列表'));
  printDivider();
  const cmds = [
    ['/model, /m', '切换 AI 模型'],
    ['/skills', '列出运行时 skills'],
    ['/skill <id|name>', '启用 skill，clear 清空'],
    ['/search, /s <query>', '网络搜索'],
    ['/clear, /c', '清空对话历史'],
    ['/info', '当前模型信息'],
    ['/help, /h', '显示此帮助'],
    ['/exit, /q', '退出对话'],
  ];
  cmds.forEach(([cmd, desc]) => {
    console.log(chalk.cyan('  ' + cmd!.padEnd(24)) + chalk.white(desc!));
  });
  console.log('');
  console.log(chalk.bold.cyan('  🔧 工具命令 (直接输入)'));
  printDivider();
  const tools = [
    ['ls <path>', '列出目录'],
    ['read <file>', '读取文件'],
    ['grep <pattern> <file>', '搜索文件内容'],
    ['search <query>', '网络搜索'],
  ];
  tools.forEach(([cmd, desc]) => {
    console.log(chalk.cyan('  ' + cmd!.padEnd(24)) + chalk.white(desc!));
  });
  console.log('');
}

async function switchModel(current: ModelInfo, session?: AiSessionState): Promise<'continue' | CommandResult> {
  console.log('');
  console.log(chalk.bold.cyan('  🔄 选择模型'));
  printDivider();

  const availableModels = getAvailableModels();
  const options = availableModels.map(m => ({
    label: `${m.name}${m.id === current.id ? chalk.green(' (当前)') : ''}`,
    value: m.id,
    description: `${m.description}${m.supportsSearch ? ' 🔍' : ''}`,
  }));

  let selected: ModelInfo | null = null;

  if (session) session.inSubmenu = true;
  try {
    await interactiveSelect({
      title: '  选择模型:',
      options,
      onSelect: (value) => {
        selected = getModelById(value) || null;
      },
      onCancel: () => { /* do nothing */ },
    });
  } finally {
    if (session) session.inSubmenu = false;
  }

  if (selected) {
    if ((selected as ModelInfo).provider === 'custom') {
      process.env.AI_MODEL = (selected as ModelInfo).id;
    }
    printSuccess(`已切换到 ${(selected as ModelInfo).name}`);
    return { model: selected };
  }
  return 'continue';
}

function printModelInfo(model: ModelInfo): void {
  console.log('');
  console.log(chalk.bold.cyan('  📊 当前模型'));
  printDivider();
  console.log(chalk.white('  名称: ') + chalk.bold(model.name));
  console.log(chalk.white('  ID:   ') + chalk.gray(model.id));
  console.log(chalk.white('  厂商: ') + chalk.yellow(model.provider === 'deepseek' ? 'DeepSeek' : '智谱 GLM'));
  console.log(chalk.white('  搜索: ') + (model.supportsSearch ? chalk.green('支持') : chalk.gray('不支持')));
  console.log('');
}

async function doSearch(
  query: string,
  messages: ChatMessage[],
  model: ModelInfo,
  signal?: AbortSignal,
  onCancelReady?: (cancel: () => void) => void
): Promise<void> {
  const spinner = new Spinner('搜索中');
  spinner.start();
  try {
    const results = await webSearch(query, 5, signal);
    if (signal?.aborted) return;
    spinner.stop();
    console.log(chalk.bold.blue('\n  🔍 搜索结果: ') + chalk.white(query));
    printDivider();
    if (!results.length) {
      printWarning('未找到相关结果');
      return;
    }
    results.forEach((r, i) => {
      const date = r.publish_date ? chalk.gray(` (${r.publish_date})`) : '';
      console.log(chalk.cyan(`  [${i + 1}] `) + chalk.bold.white(r.title) + date);
      if (r.media) console.log(chalk.gray('      来源: ' + r.media));
      const snippet = r.content.slice(0, 150) + (r.content.length > 150 ? '...' : '');
      console.log(chalk.white('      ' + snippet));
      console.log('');
    });
    printDivider();

    // Inject search results into conversation so AI can see them
    const aiContent = results.map((r, i) =>
      `[${i + 1}] ${r.title}${r.publish_date ? ` (${r.publish_date})` : ''}\n${r.content}\n来源: ${r.link}`
    ).join('\n\n');

    messages.push({
      role: 'user',
      content: `我搜索了「${query}」，以下是搜索结果：\n\n${aiContent}\n\n请根据以上搜索结果进行总结分析。`
    });

    // Auto-trigger AI to summarize
    if (signal?.aborted) return;
    await streamAIResponse(messages, model, onCancelReady);
  } catch (e: any) {
    spinner.stop();
    if (signal?.aborted || e.message === 'Search cancelled') return;
    printError('搜索失败: ' + e.message);
  }
}

/** Shared streaming AI response handler */
async function streamAIResponse(
  messages: ChatMessage[],
  model: ModelInfo,
  onCancelReady?: (cancel: () => void) => void
): Promise<void> {
  const spinner = new Spinner('AI 思考中');
  spinner.start();

  try {
    const response = await new Promise<string>((resolve, reject) => {
      let reasoningStarted = false;
      const renderer = new StreamRenderer();

      const handle = streamChat(messages, model, {
        onToken: (token) => {
          if (spinner.isRunning()) spinner.stop();
          renderer.push(token);
        },
        onReasoning: (token) => {
          if (!reasoningStarted) {
            spinner.stop();
            console.log(chalk.gray('\n  💭 思考过程:'));
            reasoningStarted = true;
          }
          process.stdout.write(chalk.gray(token));
        },
        onDone: (full) => {
          spinner.stop();
          if (reasoningStarted) {
            console.log('');
            printDivider();
          }
          renderer.finish();
          printDivider();
          resolve(full);
        },
        onError: (err) => {
          spinner.stop();
          reject(err);
        },
      });
      onCancelReady?.(handle.abort);
    });

    messages.push({ role: 'assistant', content: response });

    trimMessagesPreservingSkillContext(messages, 20);
  } catch (e: any) {
    spinner.stop();
    printError('API 错误: ' + e.message);
    messages.pop(); // remove failed user message
  }
}

export { MODELS, DEFAULT_MODEL_ID } from './models';
