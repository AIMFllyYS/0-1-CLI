import type { Bridge } from '../state/store';

// Development preview only. It is loaded by `vite dev` when there is no Electron bridge, so screens can be
// designed and checked in a normal browser. It is never imported by the production entry (see main.tsx).

type Listener = (payload: any) => void;

const SETTINGS = {
  ai: { defaultMode: 'agent', defaultModelId: '', autoAccept: false, maxToolRounds: 8 },
  github: { prefetch: true },
  startup: { cliAutostart: false, desktopAutostart: false },
  appearance: { theme: 'system' },
};

function scenarioFromUrl(): string {
  return new URLSearchParams(window.location.search).get('scenario') || 'ready';
}

export function createMockBridge(): Bridge {
  const scenario = scenarioFromUrl();
  let listener: Listener | null = null;
  let counter = 0;
  const settings = JSON.parse(JSON.stringify(SETTINGS));
  let provider = scenario === 'fresh'
    ? { configured: false, baseUrl: '', apiKeyMasked: '', modelIds: [], activeModelId: '' }
    : { configured: true, baseUrl: 'https://api.example.com/v1', apiKeyMasked: 'sk-a****9f2c', modelIds: ['deepseek-chat', 'glm-4.6'], activeModelId: 'deepseek-chat' };
  let workspace = scenario === 'fresh' ? '' : 'D:/projects/Dev-Tools/My-CLI';
  const emit = (sessionId: string, event: any): void => listener?.({ sessionId, event });
  const later = (ms: number, fn: () => void): void => { window.setTimeout(fn, ms); };

  const pendingAnswers = new Map<string, (answer: string) => void>();

  function runDemoTurn(sessionId: string, text: string): void {
    let t = 200;
    const say = (chunk: string): void => { later(t, () => emit(sessionId, { type: 'token', text: chunk })); t += 45; };
    const step = (fn: () => void, wait = 350): void => { later(t, fn); t += wait; };

    step(() => emit(sessionId, { type: 'reasoning', text: '先看一下项目结构，再决定怎么改。' }), 400);
    'README 里提到了安装步骤，我先读一下再动手。'.split('').forEach((char) => say(char));
    step(() => emit(sessionId, { type: 'agent_event', event: { type: 'assistant_message', content: '', toolCallCount: 1 } }), 100);
    step(() => emit(sessionId, { type: 'agent_event', event: { type: 'tool_start', toolCallId: 'r1', toolName: 'read_file', args: '{"path":"README.md"}' } }), 500);
    step(() => emit(sessionId, { type: 'agent_event', event: { type: 'tool_result', toolCallId: 'r1', toolName: 'read_file', permissionDecision: 'allow', contentPreview: '# My-CLI — AI CLI onboarding and development toolbox ...' } }), 300);

    if (/改|写|edit|write|fix/i.test(text)) {
      step(() => emit(sessionId, { type: 'agent_event', event: { type: 'tool_start', toolCallId: 'w1', toolName: 'write_file', args: '{"path":"src/greeting.ts","content":"x"}' } }), 300);
      const approval = {
        id: `ap-${++counter}`, kind: 'permission', toolCallId: 'w1', toolName: 'write_file',
        reason: 'agent mode requires confirmation', summary: 'src/greeting.ts',
        file: {
          path: 'src/greeting.ts', operation: 'overwrite', added: 3, removed: 1, truncated: false,
          hunks: [
            { marker: ' ', lineNo: 1, code: 'export function greet(name: string) {' },
            { marker: '-', code: "  return 'Hello ' + name;" },
            { marker: '+', lineNo: 2, code: '  const clean = name.trim() || \'世界\';' },
            { marker: '+', lineNo: 3, code: '  return `你好，${clean}！`;' },
            { marker: ' ', lineNo: 4, code: '}' },
          ],
        },
      };
      step(() => emit(sessionId, { type: 'approval_request', approval }), 100);
      pendingAnswers.set(approval.id, (answer) => {
        const refused = answer.startsWith('deny') || answer === 'cancel';
        emit(sessionId, { type: 'approval_resolved', id: approval.id, answer });
        if (refused) {
          emit(sessionId, { type: 'agent_event', event: { type: 'tool_result', toolCallId: 'w1', toolName: 'write_file', permissionDecision: 'deny', contentPreview: 'Tool denied by user' } });
          emit(sessionId, { type: 'turn_end', result: { status: 'denied' } });
          return;
        }
        later(400, () => {
          emit(sessionId, { type: 'agent_event', event: { type: 'tool_result', toolCallId: 'w1', toolName: 'write_file', permissionDecision: 'allow', contentPreview: 'OK' }, file: approval.file });
          'greeting.ts 已经更新：现在会去掉首尾空格，名字为空时用「世界」。'.split('').forEach((char, i) => later(150 + i * 25, () => emit(sessionId, { type: 'token', text: char })));
          later(150 + 40 * 25, () => emit(sessionId, { type: 'turn_end', result: { status: 'completed', message: 'done', limitReached: false } }));
        });
      });
      return;
    }

    '\n\n这个项目是一个 **CLI 工具箱**：\n\n- `hi path` 管理常用路径\n- `hi run` 在新终端里启动它们\n- `hi config` 管理设置\n\n需要我改点什么吗？'.split('').forEach((char) => say(char));
    step(() => emit(sessionId, { type: 'turn_end', result: { status: 'completed', message: 'done', limitReached: false } }), 100);
  }

  return {
    onAiEvent: (callback) => { listener = callback; return () => { listener = null; }; },
    invoke: async (channel, payload: any) => {
      switch (channel) {
        case 'app:getState':
          return { ok: true, version: '0.8.0-dev', platform: 'win32', settings, provider, workspace, recentWorkspaces: workspace ? [workspace, 'D:/projects/AI-Work-Space/DS'] : [], loginItem: false };
        case 'workspace:choose':
          workspace = 'D:/projects/Dev-Tools/My-CLI';
          return { ok: true, path: workspace };
        case 'workspace:set':
          workspace = payload.path;
          return { ok: true, path: workspace };
        case 'provider:save':
          provider = { configured: true, baseUrl: payload.baseUrl, apiKeyMasked: 'sk-n****1234', modelIds: payload.modelIds, activeModelId: payload.activeModelId };
          return { ok: true, provider };
        case 'settings:set': {
          const [group, name] = String(payload.key).split('.');
          settings[group][name] = payload.value;
          return { ok: true, key: payload.key, value: payload.value, warning: payload.key === 'ai.autoAccept' && payload.value ? '已开启自动接受：Agent 将不再逐项询问工具权限，请只在可信的工作目录中使用。' : undefined };
        }
        case 'ai:createSession':
          return { ok: true, sessionId: `mock-${++counter}`, workspace: payload.workspace || workspace, mode: payload.mode || settings.ai.defaultMode, permissionMode: (payload.mode || settings.ai.defaultMode) === 'plan' ? 'plan' : 'ask' };
        case 'ai:send':
          runDemoTurn(payload.sessionId, payload.text);
          return { ok: true };
        case 'ai:approve':
          pendingAnswers.get(payload.approvalId)?.(payload.answer);
          pendingAnswers.delete(payload.approvalId);
          return { ok: true };
        case 'ai:setMode':
          return { ok: true, mode: payload.mode, permissionMode: payload.mode === 'plan' ? 'plan' : 'ask' };
        case 'github:summary':
          return {
            ok: true, available: true, activeUsername: 'AIMFllyYS', totalIssues: 22,
            accounts: [{ username: 'AIMFllyYS', hostname: 'github.com', isActive: true }, { username: 'AIMFllys', hostname: 'github.com', isActive: false }],
            issues: [
              { number: 10, title: '增加项目定向启动器 hi run', repo: 'AIMFllyYS/0-1-CLI', url: '#', createdAt: '2026-10-25T02:53:11Z' },
              { number: 60, title: '[高中篇 4.1] 打磨：漏斗液柱太细、引流近景偏空', repo: 'AIMFllyYS/Cell-World', url: '#', createdAt: '2026-10-20T09:00:00Z' },
            ],
          };
        case 'launch:list':
          return { ok: true, entries: [{ id: 'ds', name: 'DS 工作区', path: 'D:/projects/AI-Work-Space/DS', start: 'python -m http.server 8848', kind: 'command' }, { id: 'cli', name: 'My-CLI', path: 'D:/projects/Dev-Tools/My-CLI', start: '', kind: '' }] };
        case 'launch:run':
          return { ok: true, terminal: 'wt' };
        case 'desktop-install:list':
          return [
            { key: 'cc', displayName: 'Claude Code', category: 'cli', description: 'Anthropic Claude Code CLI.' },
            { key: 'codex', displayName: 'OpenAI Codex CLI', category: 'cli', description: 'OpenAI command line coding agent.' },
            { key: 'vscode', displayName: 'Visual Studio Code', category: 'ide', description: 'Microsoft VS Code download page.', opensUrlOnly: true },
            { key: 'clash-verge', displayName: 'Clash Verge - Windows', category: 'environment', description: 'Windows proxy client download.', opensUrlOnly: true },
          ];
        case 'desktop-install:run':
          return { ok: payload.confirm === true, output: payload.confirm === true ? 'Opened https://code.visualstudio.com/download' : 'Confirm first.' };
        case 'desktop-skills:list':
          return { packages: [{ key: 'superpowers', displayName: 'Official Superpowers', description: 'Workflow skills for planning, TDD, verification, and implementation discipline.' }, { key: 'agent-onboarding', displayName: 'Agent Onboarding Skill', description: 'A beginner-friendly skill pack for learning agent workflows through real tasks.' }], targets: [{ key: 'claude', displayName: 'Claude Code', path: 'C:/Users/me/.claude/skills', detected: true }, { key: 'codex', displayName: 'Codex', path: 'C:/Users/me/.codex/skills', detected: false }] };
        case 'desktop-clear:scan':
          return { ok: true, total: 180, filtered: 2, output: '', processes: [{ pid: 4120, name: 'node', memoryMB: 612.4, cpuSeconds: 340, reason: 'High memory background process (612.4 MB).' }, { pid: 9032, name: 'python', memoryMB: 88.1, cpuSeconds: 12, reason: 'Background process without a visible app window.' }] };
        case 'desktop-clear:kill':
          return { ok: true, output: `Ended ${payload.pids.length}/${payload.pids.length} selected processes.` };
        case 'cli:run':
          return { ok: true, output: 'API 平台 · DeepSeek https://platform.deepseek.com · 智谱 AI https://open.bigmodel.cn' };
        default:
          return { ok: true };
      }
    },
  };
}
