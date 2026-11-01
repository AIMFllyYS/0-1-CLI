import * as fs from 'fs';
import * as path from 'path';
import { AgentHost } from '../chat/agent/host';
import type { AgentEvent, ApprovalAnswer, CompleteHooks } from '../chat/agent/host';
import { resolveModelInfo } from '../chat/models';
import { chatStreamMessage } from '../chat/provider';
import type { AiMode } from '../chat/session';
import type { ProviderToolSpec } from '../chat/tools/registry';
import type { ChatMessage, LaunchEntry } from '../types';
import { listLaunch, findLaunch } from '../modules/launch/registry';
import { getGitHubSummary } from '../modules/github/summary';
import type { GitHubSummary } from '../modules/github/summary';
import { loadConfigStrict, saveConfig } from '../utils/config';
import { describeProvider, updateProvider } from '../settings/provider';
import { findSettingDef, parseSettingValue } from '../settings/schema';
import { loadSettings, resetSetting, updateSetting } from '../settings/store';
import { resolveStartOptions } from '../settings/runtime';

// This list is the whole surface the renderer can reach. There is deliberately no generic shell,
// file or command channel; each channel validates its own payload.
const CHANNELS = Object.freeze([
  'app:getState',
  'settings:set',
  'settings:reset',
  'provider:save',
  'workspace:choose',
  'workspace:set',
  'github:summary',
  'launch:list',
  'launch:run',
  'ai:createSession',
  'ai:send',
  'ai:approve',
  'ai:abort',
  'ai:setMode',
  'ai:reset',
  'ai:close',
] as const);

export type DesktopChannel = (typeof CHANNELS)[number];
export const DESKTOP_CHANNELS: readonly DesktopChannel[] = CHANNELS;

export interface DesktopApiDeps {
  emit: (channel: 'ai:event', payload: { sessionId: string; event: AgentEvent }) => void;
  chooseDirectory: () => Promise<string | undefined>;
  setLoginItem: (enabled: boolean) => void;
  getLoginItem: () => boolean;
  runLaunch: (entry: LaunchEntry) => Promise<{ terminal: string }>;
  githubSummary?: () => Promise<GitHubSummary>;
  complete?: (messages: ChatMessage[], tools: ProviderToolSpec[], hooks: CompleteHooks) => Promise<ChatMessage>;
  platform?: NodeJS.Platform;
  version: string;
}

type Failure = { ok: false; error: string; code?: string };
type Reply = Record<string, unknown> & { ok: boolean };

const MAX_SESSIONS = 20;
const MAX_MESSAGE_CHARS = 100_000;
const MAX_RECENT_WORKSPACES = 8;
const MODES: readonly string[] = ['chat', 'agent', 'plan'];
const PERMISSION_ANSWERS: readonly string[] = ['allow_once', 'allow_session', 'deny', 'deny_feedback', 'cancel'];
const PLAN_ANSWERS: readonly string[] = ['approve', 'reject', 'cancel'];

function fail(error: string, code?: string): Failure {
  return code ? { ok: false, error, code } : { ok: false, error };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isFilesystemRoot(target: string): boolean {
  return path.parse(target).root === target;
}

// A workspace is where the agent may read and write, so it has to be a real, absolute, non-root directory.
function validateWorkspace(input: unknown): { ok: true; path: string } | Failure {
  const raw = str(input);
  if (!raw || !path.isAbsolute(raw)) return fail('请提供绝对路径', 'bad_workspace');
  const resolved = path.resolve(raw);
  if (isFilesystemRoot(resolved)) return fail('不能把磁盘根目录作为工作目录', 'bad_workspace');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return fail(`路径不存在：${resolved}`, 'bad_workspace');
  }
  if (!stat.isDirectory()) return fail(`路径不是目录：${resolved}`, 'bad_workspace');
  return { ok: true, path: resolved };
}

interface DesktopState {
  workspace?: string;
  recent?: string[];
}

function readDesktopState(): DesktopState {
  try {
    const raw = loadConfigStrict().desktop;
    if (!isRecord(raw)) return {};
    return {
      workspace: str(raw.workspace),
      recent: Array.isArray(raw.recent) ? raw.recent.filter((item): item is string => typeof item === 'string') : [],
    };
  } catch {
    return {};
  }
}

function writeDesktopState(state: DesktopState): void {
  const config = loadConfigStrict();
  config.desktop = state;
  saveConfig(config);
}

function existingDirectory(target: string | undefined): string {
  if (!target) return '';
  try {
    return fs.statSync(target).isDirectory() ? target : '';
  } catch {
    return '';
  }
}

export function createDesktopApi(deps: DesktopApiDeps) {
  const sessions = new Map<string, { host: AgentHost; workspace: string }>();
  const platform = deps.platform ?? process.platform;
  const complete = deps.complete ?? ((messages, tools, hooks) => {
    const settings = loadSettings();
    const model = resolveModelInfo(process.env.AI_MODEL || settings.ai.defaultModelId || '');
    return chatStreamMessage(messages, model, tools, hooks);
  });

  function getSession(input: unknown): { sessionId: string; session: { host: AgentHost; workspace: string } } | Failure {
    const sessionId = isRecord(input) ? str(input.sessionId) : undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!sessionId || !session) return fail('会话不存在或已关闭', 'no_session');
    return { sessionId, session };
  }

  const handlers: Record<DesktopChannel, (payload: unknown) => Promise<Reply> | Reply> = {
    'app:getState': () => {
      const state = readDesktopState();
      const workspace = existingDirectory(state.workspace);
      return {
        ok: true,
        version: deps.version,
        platform,
        settings: loadSettings(),
        provider: describeProvider(),
        workspace,
        recentWorkspaces: (state.recent || []).filter((item) => existingDirectory(item)),
        loginItem: deps.getLoginItem(),
      };
    },

    'settings:set': (payload) => {
      if (!isRecord(payload) || typeof payload.key !== 'string') return fail('参数无效', 'bad_request');
      try {
        const def = findSettingDef(payload.key);
        const value = parseSettingValue(def, String(payload.value));
        // Desktop autostart is an OS-side change; apply it first so a failure leaves the setting unchanged.
        if (def.key === 'startup.desktopAutostart') deps.setLoginItem(value === true);
        const result = updateSetting(def.key, String(payload.value));
        return { ok: true, key: result.key, value: result.value, ...(result.warning ? { warning: result.warning } : {}) };
      } catch (error) {
        return fail(messageOf(error));
      }
    },

    'settings:reset': (payload) => {
      try {
        const key = isRecord(payload) ? str(payload.key) : undefined;
        if (key === undefined) {
          resetSetting();
          deps.setLoginItem(false);
        } else {
          findSettingDef(key);
          resetSetting(key);
          if (key === 'startup.desktopAutostart') deps.setLoginItem(false);
        }
        return { ok: true };
      } catch (error) {
        return fail(messageOf(error));
      }
    },

    'provider:save': (payload) => {
      if (!isRecord(payload)) return fail('参数无效', 'bad_request');
      const { baseUrl, apiKey, modelIds, activeModelId } = payload;
      if (typeof baseUrl !== 'string' || typeof apiKey !== 'string' || typeof activeModelId !== 'string'
        || !Array.isArray(modelIds) || !modelIds.every((item) => typeof item === 'string')) {
        return fail('参数无效', 'bad_request');
      }
      try {
        updateProvider({ baseUrl, apiKey, modelIds: modelIds as string[], activeModelId });
        // The running process must use what was just saved, not whatever the environment held at startup.
        const saved = describeProvider();
        process.env.AI_BASE_URL = saved.baseUrl;
        process.env.AI_MODELS = saved.modelIds.join(',');
        process.env.AI_MODEL = saved.activeModelId;
        if (apiKey.trim()) process.env.AI_API_KEY = apiKey.trim();
        return { ok: true, provider: saved };
      } catch (error) {
        return fail(messageOf(error));
      }
    },

    'workspace:choose': async () => {
      const chosen = await deps.chooseDirectory();
      if (chosen === undefined) return { ok: true, path: undefined };
      const checked = validateWorkspace(chosen);
      if (!checked.ok) return checked;
      remember(checked.path);
      return { ok: true, path: checked.path };
    },

    'workspace:set': (payload) => {
      const checked = validateWorkspace(isRecord(payload) ? payload.path : undefined);
      if (!checked.ok) return checked;
      remember(checked.path);
      return { ok: true, path: checked.path };
    },

    'github:summary': async (payload) => {
      const force = isRecord(payload) && payload.force === true;
      if (!force && !loadSettings().github.prefetch) return { ok: true, skipped: true };
      try {
        const summary = await (deps.githubSummary ?? (() => getGitHubSummary()))();
        return { ...summary };
      } catch (error) {
        return fail(messageOf(error));
      }
    },

    'launch:list': () => {
      try {
        return {
          ok: true,
          entries: listLaunch().map((entry) => ({
            id: entry.id,
            name: entry.name,
            path: entry.path,
            start: entry.start?.value ?? '',
            kind: entry.start?.kind ?? '',
          })),
        };
      } catch (error) {
        return fail(messageOf(error));
      }
    },

    // Only the id is read from the payload; the command and directory always come from the saved registry.
    'launch:run': async (payload) => {
      const id = isRecord(payload) ? str(payload.id) : undefined;
      if (!id) return fail('参数无效', 'bad_request');
      try {
        const entry = findLaunch(id);
        if (!entry) return fail(`未找到 id：${id}`, 'not_found');
        const { terminal } = await deps.runLaunch(entry);
        return { ok: true, terminal };
      } catch (error) {
        return fail(messageOf(error));
      }
    },

    'ai:createSession': (payload) => {
      if (sessions.size >= MAX_SESSIONS) return fail(`最多同时打开 ${MAX_SESSIONS} 个会话`, 'too_many_sessions');
      const input = isRecord(payload) ? payload : {};
      const settings = loadSettings();
      const defaults = resolveStartOptions({}, settings);

      const requestedMode = input.mode === undefined ? defaults.mode : input.mode;
      if (typeof requestedMode !== 'string' || !MODES.includes(requestedMode)) return fail('模式无效', 'bad_request');

      const state = readDesktopState();
      const workspaceInput = input.workspace !== undefined ? input.workspace : existingDirectory(state.workspace);
      if (workspaceInput === '' || workspaceInput === undefined) return fail('请先选择一个工作目录', 'no_workspace');
      const checked = validateWorkspace(workspaceInput);
      if (!checked.ok) return checked;

      const sessionId = globalThis.crypto.randomUUID();
      const host = new AgentHost({
        workspaceRoot: checked.path,
        mode: requestedMode as AiMode,
        modelId: process.env.AI_MODEL || defaults.modelId || '',
        autoAccept: defaults.autoAccept,
        maxToolRounds: defaults.maxToolRounds,
        emit: (event) => deps.emit('ai:event', { sessionId, event }),
        complete,
      });
      sessions.set(sessionId, { host, workspace: checked.path });
      const mode = host.getMode();
      return { ok: true, sessionId, workspace: checked.path, mode: mode.mode, permissionMode: mode.permissionMode };
    },

    'ai:send': (payload) => {
      const found = getSession(payload);
      if ('ok' in found) return found;
      const text = isRecord(payload) ? payload.text : undefined;
      if (typeof text !== 'string' || !text.trim()) return fail('消息不能为空', 'bad_request');
      if (text.length > MAX_MESSAGE_CHARS) return fail(`消息过长（上限 ${MAX_MESSAGE_CHARS} 字符）`, 'bad_request');
      if (found.session.host.isRunning()) return fail('上一轮对话正在运行，请先停止或等待完成', 'busy');

      // The turn runs in the background; progress and the final result arrive as ai:event messages.
      void found.session.host.send(text).catch(() => undefined);
      return { ok: true };
    },

    'ai:approve': (payload) => {
      const found = getSession(payload);
      if ('ok' in found) return found;
      const input = payload as Record<string, unknown>;
      const approvalId = str(input.approvalId);
      const answer = str(input.answer);
      if (!approvalId || !answer) return fail('参数无效', 'bad_request');

      const pending = found.session.host.getPendingApproval();
      if (!pending || pending.id !== approvalId) return fail('没有匹配的待批准请求', 'no_approval');
      const allowed = pending.kind === 'plan' ? PLAN_ANSWERS : PERMISSION_ANSWERS;
      if (!allowed.includes(answer)) return fail('该请求不支持这个回答', 'bad_answer');

      const feedback = str(input.feedback);
      const settled = found.session.host.resolveApproval(approvalId, answer as ApprovalAnswer, feedback ? feedback.slice(0, 2000) : undefined);
      return settled ? { ok: true } : fail('没有匹配的待批准请求', 'no_approval');
    },

    'ai:abort': (payload) => {
      const found = getSession(payload);
      if ('ok' in found) return found;
      found.session.host.abort();
      return { ok: true };
    },

    'ai:setMode': (payload) => {
      const found = getSession(payload);
      if ('ok' in found) return found;
      const mode = isRecord(payload) ? payload.mode : undefined;
      if (typeof mode !== 'string' || !MODES.includes(mode)) return fail('模式无效', 'bad_request');
      try {
        found.session.host.setMode(mode as AiMode);
        const current = found.session.host.getMode();
        return { ok: true, mode: current.mode, permissionMode: current.permissionMode };
      } catch (error) {
        return fail(messageOf(error), 'busy');
      }
    },

    'ai:reset': (payload) => {
      const found = getSession(payload);
      if ('ok' in found) return found;
      try {
        found.session.host.reset();
        return { ok: true };
      } catch (error) {
        return fail(messageOf(error), 'busy');
      }
    },

    'ai:close': (payload) => {
      const sessionId = isRecord(payload) ? str(payload.sessionId) : undefined;
      const session = sessionId ? sessions.get(sessionId) : undefined;
      if (sessionId && session) {
        session.host.abort();
        sessions.delete(sessionId);
      }
      return { ok: true };
    },
  };

  function remember(workspace: string): void {
    const state = readDesktopState();
    const recent = [workspace, ...(state.recent || []).filter((item) => item !== workspace)].slice(0, MAX_RECENT_WORKSPACES);
    try {
      writeDesktopState({ workspace, recent });
    } catch { /* a read-only config must not stop the user from working */ }
  }

  return {
    channels: CHANNELS,

    async invoke(channel: unknown, payload?: unknown): Promise<Reply> {
      if (typeof channel !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, channel)) {
        return fail(`Unknown channel: ${String(channel)}`, 'unknown_channel') as unknown as Reply;
      }
      try {
        return await handlers[channel as DesktopChannel](payload);
      } catch (error) {
        return fail(messageOf(error), 'internal') as unknown as Reply;
      }
    },

    // Called once at startup: make the OS startup entry agree with the saved setting.
    async init(): Promise<void> {
      try {
        deps.setLoginItem(loadSettings().startup.desktopAutostart);
      } catch { /* e.g. an unpackaged dev build; the setting stays as saved */ }
    },

    dispose(): void {
      for (const { host } of sessions.values()) host.abort();
      sessions.clear();
    },
  };
}
