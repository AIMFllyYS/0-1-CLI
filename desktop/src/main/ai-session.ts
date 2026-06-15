import { app } from 'electron';
import * as path from 'path';

export type DesktopAiMode = 'chat' | 'agent' | 'plan';

export interface DesktopAiMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  meta?: string;
}

export interface DesktopAiMessageRequest {
  sessionId?: string;
  mode?: unknown;
  messages?: DesktopAiMessage[];
  text?: unknown;
}

export interface DesktopAiMessageResult {
  ok: boolean;
  message?: DesktopAiMessage;
  activity?: DesktopAiActivity[];
  output?: string;
  error?: string;
}

export interface DesktopAiActivity {
  title: string;
  status: string;
  detail: string;
}

interface RuntimeChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

interface RuntimeAgentEvent {
  type: string;
  round?: number;
  content?: string;
  toolCallCount?: number;
  toolCallId?: string;
  toolName?: string;
  permissionDecision?: string;
  reason?: string;
  status?: string;
  toolResultCount?: number;
  permissionCount?: number;
}

interface RuntimeAgentResult {
  status: 'completed' | 'permission_required' | 'plan_approval_required';
  finalMessage?: RuntimeChatMessage;
  toolResults: unknown[];
  pendingToolCall?: { function: { name: string } };
  permission?: { reason?: string };
  plan?: string;
  permissions?: unknown[];
}

interface RuntimeModel {
  id: string;
  name: string;
  provider: 'deepseek' | 'zhipu' | 'custom';
  description: string;
}

interface RuntimeModules {
  runAgentTurn: (input: {
    messages: RuntimeChatMessage[];
    workspaceRoot: string;
    mode: DesktopAiMode;
    permissionMode: 'ask' | 'plan';
    maxToolRounds: number;
    onEvent?: (event: RuntimeAgentEvent) => void;
    complete: (turnMessages: RuntimeChatMessage[]) => Promise<RuntimeChatMessage>;
  }) => Promise<RuntimeAgentResult>;
  chatCompleteMessage: (messages: RuntimeChatMessage[], model: RuntimeModel, tools?: unknown[]) => Promise<RuntimeChatMessage>;
  resolveModelInfo: (id: string, env: NodeJS.ProcessEnv) => RuntimeModel;
  DEFAULT_MODEL_ID: string;
  parseAiEnv: (env: NodeJS.ProcessEnv) => { activeModelId?: string };
  buildProviderToolSpecs: (mode: DesktopAiMode) => unknown[];
  buildSystemPrompt: (options: {
    workspaceRoot: string;
    mode: DesktopAiMode;
    permissionMode: 'ask' | 'plan';
    modelId: string;
    toolNames?: string[];
    env?: NodeJS.ProcessEnv;
  }) => string;
}

interface DesktopAiSessionState {
  messages: RuntimeChatMessage[];
  activity: DesktopAiActivity[];
  updatedAt: number;
}

const desktopAiSessions = new Map<string, DesktopAiSessionState>();

function resolveRuntimeDist(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'cli')
    : path.resolve(__dirname, '..', '..', '..', 'dist');
}

function resolveMode(value: unknown): DesktopAiMode {
  if (value === 'agent' || value === 'plan') return value;
  return 'chat';
}

function resolveSessionId(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
  return 'default';
}

function getDesktopAiSession(sessionId: string): DesktopAiSessionState {
  const existing = desktopAiSessions.get(sessionId);
  if (existing) return existing;
  const created: DesktopAiSessionState = {
    messages: [],
    activity: [],
    updatedAt: Date.now(),
  };
  desktopAiSessions.set(sessionId, created);
  return created;
}

function safeSeedMessages(messages: unknown): RuntimeChatMessage[] {
  const list = Array.isArray(messages) ? messages : [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter((item) => item.role === 'system' || item.role === 'user' || item.role === 'assistant' || item.role === 'tool')
    .map((item) => ({
      role: item.role as RuntimeChatMessage['role'],
      content: typeof item.content === 'string' ? item.content : '',
    }))
    .filter((item) => item.role !== 'system')
    .filter((item) => item.content.trim());
}

function appendDesktopUserMessage(session: DesktopAiSessionState, text: unknown): boolean {
  if (typeof text !== 'string' || !text.trim()) return false;
  const content = text.trim();
  const last = session.messages.at(-1);
  if (last?.role === 'user' && last.content === content) return true;
  session.messages.push({ role: 'user', content });
  session.updatedAt = Date.now();
  return true;
}

function activityFromAgentEvents(events: RuntimeAgentEvent[], mode: DesktopAiMode): DesktopAiActivity[] {
  const latestTool = [...events].reverse().find((event) => event.type === 'tool_start' || event.type === 'tool_result');
  const latestPermission = [...events].reverse().find((event) => event.type === 'permission_required');
  const completion = [...events].reverse().find((event) => event.type === 'turn_complete');
  const assistantMessages = events.filter((event) => event.type === 'assistant_message').length;
  const toolResults = events.filter((event) => event.type === 'tool_result').length;

  return [
    {
      title: 'Thinking',
      status: completion ? 'complete' : latestPermission ? 'waiting' : 'working',
      detail: completion
        ? `${assistantMessages} model passes completed.`
        : latestPermission
          ? 'Waiting for permission before continuing.'
          : 'Reading context and deciding the next action.',
    },
    {
      title: 'Tools',
      status: latestPermission ? 'permission required' : toolResults ? 'used' : latestTool ? 'running' : 'idle',
      detail: latestPermission?.reason || latestTool?.toolName || `${toolResults} tool calls this turn.`,
    },
    {
      title: 'Plan',
      status: mode === 'plan' ? 'active' : 'idle',
      detail: mode === 'plan' ? 'Plan mode can request approval before edits.' : `Mode /${mode}`,
    },
  ];
}

function storeCompletedTurn(session: DesktopAiSessionState, turnMessages: RuntimeChatMessage[]): void {
  session.messages = turnMessages.filter((message) => message.role !== 'system');
  session.updatedAt = Date.now();
}

function storeSyntheticAssistantMessage(session: DesktopAiSessionState, message: DesktopAiMessage): void {
  session.messages.push({ role: 'assistant', content: message.content });
  session.updatedAt = Date.now();
}

function rememberSeedMessages(session: DesktopAiSessionState, messages: unknown): void {
  if (session.messages.length > 0) return;
  session.messages.push(...safeSeedMessages(messages));
  session.updatedAt = Date.now();
}

function hasConversationInput(session: DesktopAiSessionState): boolean {
  return session.messages.some((message) => message.role === 'user');
}

function sessionActivity(events: RuntimeAgentEvent[], session: DesktopAiSessionState, mode: DesktopAiMode): DesktopAiActivity[] {
  const activity = activityFromAgentEvents(events, mode);
  session.activity = activity;
  return activity;
}

function toolNamesFromSpecs(tools: unknown[]): string[] {
  return tools
    .map((tool) => {
      if (!tool || typeof tool !== 'object') return '';
      const fn = (tool as { function?: { name?: unknown } }).function;
      return typeof fn?.name === 'string' ? fn.name : '';
    })
    .filter(Boolean);
}

function buildTurnMessages(systemPrompt: string, session: DesktopAiSessionState): RuntimeChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...session.messages,
  ];
}

function fallbackActivity(status: string, detail: string): DesktopAiActivity[] {
  return [{ title: 'Thinking', status, detail }];
}

function completedActivity(result: RuntimeAgentResult, events: RuntimeAgentEvent[], session: DesktopAiSessionState, mode: DesktopAiMode): DesktopAiActivity[] {
  if (events.length) return sessionActivity(events, session, mode);
  return [
    { title: 'Thinking', status: 'complete', detail: 'Assistant response returned.' },
    { title: 'Tools', status: result.toolResults.length ? 'used' : 'idle', detail: `${result.toolResults.length} tool calls this turn.` },
    { title: 'Plan', status: mode === 'plan' ? 'reviewed' : 'idle', detail: `Mode /${mode}` },
  ];
}

function permissionActivity(result: RuntimeAgentResult, events: RuntimeAgentEvent[], session: DesktopAiSessionState, mode: DesktopAiMode): DesktopAiActivity[] {
  if (events.length) return sessionActivity(events, session, mode);
  return [{ title: 'Tools', status: 'permission required', detail: result.permission?.reason || result.pendingToolCall?.function.name || 'tool call' }];
}

function planActivity(result: RuntimeAgentResult, events: RuntimeAgentEvent[], session: DesktopAiSessionState, mode: DesktopAiMode): DesktopAiActivity[] {
  if (events.length) return sessionActivity(events, session, mode);
  return [{ title: 'Plan', status: 'approval required', detail: `${result.permissions?.length || 0} permission groups requested` }];
}

function buildPermissionMessage(result: RuntimeAgentResult): DesktopAiMessage {
  return {
    role: 'assistant',
    content: `Permission required for ${result.pendingToolCall?.function.name || 'tool call'}. Open the CLI terminal bridge to review and approve this tool call.`,
    meta: 'permission',
  };
}

function buildPlanMessage(result: RuntimeAgentResult): DesktopAiMessage {
  return { role: 'assistant', content: result.plan || 'Plan approval requested.', meta: 'plan approval' };
}

function buildCompletedMessage(result: RuntimeAgentResult): DesktopAiMessage {
  return {
    role: 'assistant',
    content: result.finalMessage?.content || 'Done.',
    meta: result.toolResults.length ? `${result.toolResults.length} tool results` : 'done',
  };
}

export function clearDesktopAiSessions(): void {
  desktopAiSessions.clear();
}

export function getDesktopAiSessionSnapshot(sessionId = 'default'): { messages: RuntimeChatMessage[]; activity: DesktopAiActivity[] } {
  const session = getDesktopAiSession(sessionId);
  return {
    messages: [...session.messages],
    activity: [...session.activity],
  };
}

export async function sendDesktopAiMessage(request: DesktopAiMessageRequest): Promise<DesktopAiMessageResult> {
  const runtimeDist = resolveRuntimeDist();
  const mode = resolveMode(request.mode);
  const session = getDesktopAiSession(resolveSessionId(request.sessionId));
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
  rememberSeedMessages(session, request.messages);
  appendDesktopUserMessage(session, request.text);
  const permissionMode = mode === 'plan' ? 'plan' : 'ask';

  if (!hasConversationInput(session)) {
    return { ok: false, error: 'Message is empty.' };
  }

  try {
    const { runAgentTurn } = require(path.join(runtimeDist, 'chat', 'agent', 'loop.js')) as Pick<RuntimeModules, 'runAgentTurn'>;
    const { chatCompleteMessage } = require(path.join(runtimeDist, 'chat', 'provider.js')) as Pick<RuntimeModules, 'chatCompleteMessage'>;
    const { resolveModelInfo, DEFAULT_MODEL_ID } = require(path.join(runtimeDist, 'chat', 'models.js')) as Pick<RuntimeModules, 'resolveModelInfo' | 'DEFAULT_MODEL_ID'>;
    const { parseAiEnv } = require(path.join(runtimeDist, 'chat', 'config.js')) as Pick<RuntimeModules, 'parseAiEnv'>;
    const { buildProviderToolSpecs } = require(path.join(runtimeDist, 'chat', 'tools', 'registry.js')) as Pick<RuntimeModules, 'buildProviderToolSpecs'>;
    const { buildSystemPrompt } = require(path.join(runtimeDist, 'chat', 'prompt.js')) as Pick<RuntimeModules, 'buildSystemPrompt'>;
    const settings = parseAiEnv(process.env);
    const model = resolveModelInfo(settings.activeModelId || DEFAULT_MODEL_ID, process.env);
    const tools = buildProviderToolSpecs(mode);
    const toolNames = toolNamesFromSpecs(tools);
    const systemPrompt = buildSystemPrompt({
      workspaceRoot,
      mode,
      permissionMode,
      modelId: model.id,
      toolNames,
      env: process.env,
    });
    const turnMessages = buildTurnMessages(systemPrompt, session);
    const events: RuntimeAgentEvent[] = [];
    const result = await runAgentTurn({
      messages: turnMessages,
      workspaceRoot,
      mode,
      permissionMode,
      maxToolRounds: 4,
      onEvent: (event) => {
        events.push(event);
        session.activity = activityFromAgentEvents(events, mode);
      },
      complete: (messagesForTurn: RuntimeChatMessage[]) => chatCompleteMessage(messagesForTurn, model, tools),
    });

    if (result.status === 'permission_required') {
      const message = buildPermissionMessage(result);
      storeSyntheticAssistantMessage(session, message);
      return {
        ok: true,
        message,
        activity: permissionActivity(result, events, session, mode),
      };
    }

    if (result.status === 'plan_approval_required') {
      const message = buildPlanMessage(result);
      storeSyntheticAssistantMessage(session, message);
      return {
        ok: true,
        message,
        activity: planActivity(result, events, session, mode),
      };
    }

    storeCompletedTurn(session, turnMessages);
    return {
      ok: true,
      message: buildCompletedMessage(result),
      activity: completedActivity(result, events, session, mode),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedded AI request failed.';
    const activity = fallbackActivity('error', message);
    session.activity = activity;
    return {
      ok: false,
      error: message,
      message: { role: 'assistant', content: message, meta: 'error' },
      activity,
    };
  }
}
