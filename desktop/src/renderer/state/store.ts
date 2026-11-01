import { addUserMessage, applyEvent, createSession, pendingApproval } from './transcript';
import type { Mode, PermissionMode, SessionState } from './transcript';

// The store is plain TypeScript with an injected bridge, so the whole app's behavior can be tested
// without a browser; React components only subscribe to it and call its methods.

export interface Bridge {
  invoke: (channel: string, payload?: unknown) => Promise<any>;
  onAiEvent?: (callback: (payload: any) => void) => () => void;
}

export type Page = 'chat' | 'launch' | 'tools' | 'settings';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  ai: { defaultMode: Mode; defaultModelId: string; autoAccept: boolean; maxToolRounds: number };
  github: { prefetch: boolean };
  startup: { cliAutostart: boolean; desktopAutostart: boolean };
  appearance: { theme: ThemeChoice };
}

export interface ProviderView {
  configured: boolean;
  baseUrl: string;
  apiKeyMasked: string;
  modelIds: string[];
  activeModelId: string;
}

export interface ProviderInput {
  baseUrl: string;
  apiKey: string;
  modelIds: string[];
  activeModelId: string;
}

export type Attention = 'approval' | 'done';

export interface Session extends SessionState {
  attention?: Attention;
}

export interface Toast {
  id: number;
  tone: 'info' | 'error' | 'warn' | 'success';
  text: string;
}

export interface GithubState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'disabled';
  data?: any;
  error?: string;
}

export interface LaunchEntryView {
  id: string;
  name: string;
  path: string;
  start: string;
  kind: string;
}

export interface LaunchState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: LaunchEntryView[];
  error?: string;
}

// Native tool channels the renderer may call through callTool; anything else is refused before it reaches the bridge.
const TOOL_CHANNELS: readonly string[] = [
  'cli:run',
  'desktop-install:list',
  'desktop-install:run',
  'desktop-skills:list',
  'desktop-skills:install',
  'desktop-clear:scan',
  'desktop-clear:kill',
  'release:getLatest',
  'release:openLatest',
  'release:openAsset',
];

export interface AppState {
  ready: boolean;
  bridgeMissing: boolean;
  fatal: string;
  version: string;
  platform: string;
  settings: Settings;
  provider: ProviderView;
  workspace: string;
  recentWorkspaces: string[];
  page: Page;
  sessions: Session[];
  activeId: string;
  toast?: Toast;
  github: GithubState;
  launch: LaunchState;
}

const DEFAULT_SETTINGS: Settings = {
  ai: { defaultMode: 'chat', defaultModelId: '', autoAccept: false, maxToolRounds: 8 },
  github: { prefetch: true },
  startup: { cliAutostart: false, desktopAutostart: false },
  appearance: { theme: 'system' },
};

const EMPTY_PROVIDER: ProviderView = { configured: false, baseUrl: '', apiKeyMasked: '', modelIds: [], activeModelId: '' };

function initialState(): AppState {
  return {
    ready: false,
    bridgeMissing: false,
    fatal: '',
    version: '',
    platform: '',
    settings: DEFAULT_SETTINGS,
    provider: EMPTY_PROVIDER,
    workspace: '',
    recentWorkspaces: [],
    page: 'chat',
    sessions: [],
    activeId: '',
    github: { status: 'idle' },
    launch: { status: 'idle', entries: [] },
  };
}

function errorText(result: any, fallback: string): string {
  return typeof result?.error === 'string' && result.error ? result.error : fallback;
}

function setByPath<T>(target: T, key: string, value: unknown): T {
  const [group, name] = key.split('.');
  const section = (target as any)[group];
  return { ...target, [group]: { ...section, [name]: value } };
}

export function createStore(bridge: Bridge | undefined) {
  let state = initialState();
  let toastCounter = 0;
  let unsubscribeEvents: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const emitChange = (): void => listeners.forEach((listener) => listener());
  const update = (patch: Partial<AppState> | ((current: AppState) => AppState)): void => {
    state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    emitChange();
  };

  const toast = (tone: Toast['tone'], text: string): void => {
    toastCounter += 1;
    update({ toast: { id: toastCounter, tone, text } });
  };

  const patchSession = (id: string, change: (session: Session) => Session): void => {
    update((current) => ({
      ...current,
      sessions: current.sessions.map((session) => (session.id === id ? change(session) : session)),
    }));
  };

  const invoke = async (channel: string, payload?: unknown): Promise<any> => {
    if (!bridge) return { ok: false, error: 'bridge unavailable' };
    try {
      return await bridge.invoke(channel, payload);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const activeSession = (): Session | undefined => state.sessions.find((session) => session.id === state.activeId);

  function handleEvent(payload: { sessionId?: string; event?: any }): void {
    const id = payload?.sessionId;
    if (!id || !state.sessions.some((session) => session.id === id)) return;
    patchSession(id, (session) => {
      const next: Session = { ...applyEvent(session, payload as any) };
      next.attention = session.attention;
      if (id !== state.activeId) {
        if (payload.event?.type === 'approval_request') next.attention = 'approval';
        else if (payload.event?.type === 'turn_end' && next.attention !== 'approval') next.attention = 'done';
      }
      if (payload.event?.type === 'approval_resolved' && next.attention === 'approval') next.attention = undefined;
      return next;
    });
  }

  return {
    getState: (): AppState => state,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    activeSession,

    setup() {
      const needsWorkspace = !state.workspace;
      const needsProvider = !state.provider.configured;
      return { needsWorkspace, needsProvider, complete: !needsWorkspace && !needsProvider };
    },

    pendingApprovalCount(): number {
      return state.sessions.filter((session) => pendingApproval(session) !== undefined).length;
    },

    resolvedTheme(systemPrefersDark: boolean): 'light' | 'dark' {
      const choice = state.settings.appearance.theme;
      if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
      return choice;
    },

    async init(): Promise<void> {
      if (state.ready) return;
      if (!bridge) {
        update({ bridgeMissing: true, fatal: '无法连接到应用后台（桥接未加载）。请重新安装或重启应用。' });
        return;
      }
      const result = await invoke('app:getState');
      if (!result.ok) {
        update({ fatal: errorText(result, '读取应用状态失败') });
        return;
      }
      if (!unsubscribeEvents && bridge.onAiEvent) unsubscribeEvents = bridge.onAiEvent(handleEvent);
      update({
        ready: true,
        version: result.version,
        platform: result.platform,
        settings: result.settings,
        provider: result.provider,
        workspace: result.workspace || '',
        recentWorkspaces: result.recentWorkspaces || [],
      });
    },

    dispose(): void {
      unsubscribeEvents?.();
      unsubscribeEvents = null;
    },

    async setPage(page: Page): Promise<void> {
      update({ page });
    },

    dismissToast(id: number): void {
      if (state.toast && state.toast.id === id) update({ toast: undefined });
    },

    async chooseWorkspace(): Promise<void> {
      const result = await invoke('workspace:choose');
      if (!result.ok) {
        toast('error', errorText(result, '选择目录失败'));
        return;
      }
      if (!result.path) return;
      update((current) => ({
        ...current,
        workspace: result.path,
        recentWorkspaces: [result.path, ...current.recentWorkspaces.filter((item) => item !== result.path)].slice(0, 8),
      }));
    },

    async useWorkspace(path: string): Promise<void> {
      const result = await invoke('workspace:set', { path });
      if (!result.ok) {
        toast('error', errorText(result, '无法使用这个目录'));
        return;
      }
      update((current) => ({
        ...current,
        workspace: result.path,
        recentWorkspaces: [result.path, ...current.recentWorkspaces.filter((item) => item !== result.path)].slice(0, 8),
      }));
    },

    async newSession(options: { mode?: Mode } = {}): Promise<{ ok: boolean; error?: string }> {
      const result = await invoke('ai:createSession', { workspace: state.workspace || undefined, mode: options.mode });
      if (!result.ok) {
        toast('error', errorText(result, '创建会话失败'));
        return { ok: false, error: errorText(result, '创建会话失败') };
      }
      const session: Session = createSession({
        id: result.sessionId,
        workspace: result.workspace,
        mode: result.mode as Mode,
        permissionMode: result.permissionMode as PermissionMode,
      });
      update((current) => ({ ...current, sessions: [...current.sessions, session], activeId: session.id, page: 'chat' }));
      return { ok: true };
    },

    selectSession(id: string): void {
      if (!state.sessions.some((session) => session.id === id)) return;
      update((current) => ({
        ...current,
        activeId: id,
        page: 'chat',
        sessions: current.sessions.map((session) => (session.id === id ? { ...session, attention: undefined } : session)),
      }));
    },

    async closeSession(id: string): Promise<void> {
      await invoke('ai:close', { sessionId: id });
      update((current) => {
        const index = current.sessions.findIndex((session) => session.id === id);
        if (index === -1) return current;
        const sessions = current.sessions.filter((session) => session.id !== id);
        const neighbour = sessions[Math.min(index, sessions.length - 1)];
        return { ...current, sessions, activeId: current.activeId === id ? (neighbour ? neighbour.id : '') : current.activeId };
      });
    },

    async send(text: string): Promise<{ ok: boolean; error?: string }> {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: 'empty' };

      let session = activeSession();
      if (!session) {
        const created = await this.newSession();
        if (!created.ok) return created;
        session = activeSession();
      }
      if (!session) return { ok: false, error: 'no_session' };

      const id = session.id;
      patchSession(id, (current) => ({ ...addUserMessage(current, trimmed), attention: undefined }));
      const result = await invoke('ai:send', { sessionId: id, text: trimmed });
      if (!result.ok) {
        patchSession(id, (current) => ({ ...current, running: false }));
        toast('error', errorText(result, '发送失败'));
        return { ok: false, error: errorText(result, '发送失败') };
      }
      return { ok: true };
    },

    async approve(answer: string, feedback?: string): Promise<{ ok: boolean; error?: string }> {
      const session = activeSession();
      const pending = session ? pendingApproval(session) : undefined;
      if (!session || !pending) return { ok: false, error: 'no_pending' };
      const payload: Record<string, unknown> = { sessionId: session.id, approvalId: pending.approval.id, answer };
      if (feedback) payload.feedback = feedback;
      const result = await invoke('ai:approve', payload);
      if (!result.ok) {
        toast('error', errorText(result, '提交失败'));
        return { ok: false, error: errorText(result, '提交失败') };
      }
      return { ok: true };
    },

    async stop(): Promise<void> {
      const session = activeSession();
      if (!session || !session.running) return;
      await invoke('ai:abort', { sessionId: session.id });
    },

    async setMode(mode: Mode): Promise<void> {
      const session = activeSession();
      if (!session) return;
      const result = await invoke('ai:setMode', { sessionId: session.id, mode });
      if (!result.ok) {
        toast('error', errorText(result, '无法切换模式'));
        return;
      }
      patchSession(session.id, (current) => ({ ...current, mode: result.mode, permissionMode: result.permissionMode }));
    },

    async setSetting(key: string, value: unknown): Promise<void> {
      const result = await invoke('settings:set', { key, value });
      if (!result.ok) {
        toast('error', errorText(result, '保存设置失败'));
        return;
      }
      update((current) => ({ ...current, settings: setByPath(current.settings, key, result.value ?? value) }));
      if (result.warning) toast('warn', result.warning);
    },

    async saveProvider(input: ProviderInput): Promise<{ ok: boolean; error?: string }> {
      const result = await invoke('provider:save', input);
      if (!result.ok) return { ok: false, error: errorText(result, '保存失败') };
      update({ provider: result.provider });
      toast('success', '模型设置已保存');
      return { ok: true };
    },

    async loadLaunch(): Promise<void> {
      update({ launch: { ...state.launch, status: 'loading' } });
      const result = await invoke('launch:list');
      if (!result.ok) {
        update({ launch: { status: 'error', entries: state.launch.entries, error: errorText(result, '读取启动台失败') } });
        return;
      }
      update({ launch: { status: 'ready', entries: result.entries || [] } });
    },

    async runLaunch(id: string): Promise<{ ok: boolean; error?: string }> {
      const result = await invoke('launch:run', { id });
      if (!result.ok) {
        toast('error', errorText(result, '启动失败'));
        return { ok: false, error: errorText(result, '启动失败') };
      }
      const entry = state.launch.entries.find((item) => item.id === id);
      toast('success', `已在新终端启动 ${entry ? entry.name : id}`);
      return { ok: true };
    },

    async callTool(channel: unknown, payload?: unknown): Promise<any> {
      if (typeof channel !== 'string' || !TOOL_CHANNELS.includes(channel)) {
        return { ok: false, error: `Channel not allowed: ${String(channel)}` };
      }
      return invoke(channel, payload);
    },

    async loadGithub(options: { force?: boolean } = {}): Promise<void> {
      update({ github: { ...state.github, status: 'loading' } });
      const result = await invoke('github:summary', { force: options.force === true });
      if (!result.ok) {
        update({ github: { status: 'error', data: state.github.data, error: errorText(result, '读取 GitHub 失败') } });
        return;
      }
      if (result.skipped) {
        update({ github: { status: 'disabled' } });
        return;
      }
      update({ github: { status: 'ready', data: result } });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
