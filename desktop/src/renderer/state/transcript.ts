// Pure state for one conversation. The renderer feeds it events from the main process and renders the result;
// keeping it free of React makes the whole turn lifecycle testable without a browser.

export type Mode = 'chat' | 'agent' | 'plan';
export type PermissionMode = 'ask' | 'bypass' | 'plan';

export interface DiffLine {
  marker: '+' | '-' | ' ';
  lineNo?: number;
  code: string;
}

export interface FileChange {
  path: string;
  operation: 'create' | 'overwrite' | 'edit';
  added: number;
  removed: number;
  hunks: DiffLine[];
  truncated: boolean;
}

export interface Approval {
  id: string;
  kind: 'permission' | 'plan';
  toolCallId: string;
  toolName: string;
  reason: string;
  summary?: string;
  warning?: string;
  file?: FileChange;
  plan?: string;
}

export type ToolStatus = 'running' | 'waiting' | 'done' | 'denied' | 'error';

export type Item =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; reasoning: string; streaming: boolean }
  | {
      kind: 'tool';
      id: string;
      toolCallId: string;
      name: string;
      summary: string;
      status: ToolStatus;
      preview?: string;
      file?: FileChange;
    }
  | { kind: 'approval'; id: string; approval: Approval; answer?: string }
  | { kind: 'notice'; id: string; tone: 'info' | 'warn' | 'error'; text: string };

export interface SessionState {
  id: string;
  workspace: string;
  mode: Mode;
  permissionMode: PermissionMode;
  title: string;
  running: boolean;
  items: Item[];
  counter: number;
}

export interface IncomingEvent {
  sessionId: string;
  event: any;
}

const TITLE_LIMIT = 40;

export function createSession(input: { id: string; workspace: string; mode: Mode; permissionMode: PermissionMode }): SessionState {
  return { ...input, title: '', running: false, items: [], counter: 0 };
}

export function summarizeArgs(toolName: string, args: unknown): string {
  if (typeof args !== 'string' || !args) return '';
  try {
    const parsed = JSON.parse(args);
    if (!parsed || typeof parsed !== 'object') return '';
    if (toolName === 'shell' && typeof parsed.command === 'string') {
      const rest = Array.isArray(parsed.args) ? parsed.args.filter((item: unknown) => typeof item === 'string') : [];
      return [parsed.command, ...rest].join(' ');
    }
    return typeof parsed.path === 'string' ? parsed.path : '';
  } catch {
    return '';
  }
}

function nextId(state: SessionState, prefix: string): { id: string; counter: number } {
  const counter = state.counter + 1;
  return { id: `${prefix}-${counter}`, counter };
}

function append(state: SessionState, build: (id: string) => Item): SessionState {
  const { id, counter } = nextId(state, 'i');
  return { ...state, counter, items: [...state.items, build(id)] };
}

function mapItem(state: SessionState, predicate: (item: Item) => boolean, update: (item: Item) => Item): SessionState {
  let changed = false;
  const items = state.items.map((item) => {
    if (changed || !predicate(item)) return item;
    changed = true;
    return update(item);
  });
  return changed ? { ...state, items } : state;
}

export function addUserMessage(state: SessionState, text: string): SessionState {
  const trimmed = text.trim();
  const firstLine = trimmed.split('\n')[0].trim();
  const title = state.title || (firstLine.length > TITLE_LIMIT ? `${firstLine.slice(0, TITLE_LIMIT)}…` : firstLine);
  const next = append(state, (id) => ({ kind: 'user', id, text: trimmed }));
  return { ...next, title, running: true };
}

export function pendingApproval(state: SessionState): Extract<Item, { kind: 'approval' }> | undefined {
  return state.items.find((item): item is Extract<Item, { kind: 'approval' }> => item.kind === 'approval' && item.answer === undefined);
}

function streamInto(state: SessionState, field: 'text' | 'reasoning', chunk: string): SessionState {
  const last = state.items[state.items.length - 1];
  if (last && last.kind === 'assistant' && last.streaming) {
    const items = state.items.slice(0, -1);
    items.push({ ...last, [field]: last[field] + chunk });
    return { ...state, items };
  }
  return append(state, (id) => ({
    kind: 'assistant',
    id,
    text: field === 'text' ? chunk : '',
    reasoning: field === 'reasoning' ? chunk : '',
    streaming: true,
  }));
}

function endStreaming(state: SessionState): SessionState {
  if (!state.items.some((item) => item.kind === 'assistant' && item.streaming)) return state;
  return {
    ...state,
    items: state.items.map((item) => (item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item)),
  };
}

function outcomeNotice(result: any): { tone: 'info' | 'warn' | 'error'; text: string } | undefined {
  switch (result?.status) {
    case 'error':
      return { tone: 'error', text: String(result.error || '出错了') };
    case 'cancelled':
      return { tone: 'info', text: '已停止' };
    case 'denied':
      return { tone: 'info', text: '你拒绝了这次操作，对话已结束' };
    case 'plan_rejected':
      return { tone: 'info', text: '计划未通过，仍在计划模式' };
    case 'completed':
      return result.limitReached ? { tone: 'warn', text: '已达到工具调用轮数上限，已自动停止' } : undefined;
    default:
      return undefined;
  }
}

function applyAgentEvent(state: SessionState, event: any, file?: FileChange): SessionState {
  switch (event?.type) {
    case 'assistant_message':
      return endStreaming(state);
    case 'tool_start': {
      const toolCallId = String(event.toolCallId || '');
      const name = String(event.toolName || 'tool');
      return append(endStreaming(state), (id) => ({
        kind: 'tool',
        id,
        toolCallId,
        name,
        summary: summarizeArgs(name, event.args),
        status: 'running',
      }));
    }
    case 'tool_result': {
      const decision = event.permissionDecision;
      const status: ToolStatus = decision === 'deny' ? 'denied' : 'done';
      return mapItem(
        state,
        (item) => item.kind === 'tool' && item.toolCallId === event.toolCallId,
        (item) => (item.kind === 'tool'
          ? { ...item, status, preview: typeof event.contentPreview === 'string' ? event.contentPreview : item.preview, file: file ?? item.file }
          : item),
      );
    }
    default:
      return state;
  }
}

export function applyEvent(state: SessionState, incoming: IncomingEvent): SessionState {
  const event = incoming?.event;
  if (!event || typeof event !== 'object') return state;

  switch (event.type) {
    case 'token':
      return typeof event.text === 'string' ? streamInto(state, 'text', event.text) : state;
    case 'reasoning':
      return typeof event.text === 'string' ? streamInto(state, 'reasoning', event.text) : state;
    case 'agent_event':
      return applyAgentEvent(state, event.event, event.file);
    case 'mode_changed':
      return { ...state, mode: event.mode, permissionMode: event.permissionMode };
    case 'approval_request': {
      const approval = event.approval as Approval;
      const waiting = mapItem(
        endStreaming(state),
        (item) => item.kind === 'tool' && item.toolCallId === approval.toolCallId,
        (item) => (item.kind === 'tool' ? { ...item, status: 'waiting' } : item),
      );
      return append(waiting, (id) => ({ kind: 'approval', id, approval }));
    }
    case 'approval_resolved': {
      const answer = String(event.answer);
      const resolved = mapItem(
        state,
        (item) => item.kind === 'approval' && item.approval.id === event.id,
        (item) => (item.kind === 'approval' ? { ...item, answer } : item),
      );
      const approval = resolved.items.find((item) => item.kind === 'approval' && item.approval.id === event.id);
      if (!approval || approval.kind !== 'approval') return resolved;
      const refused = answer === 'deny' || answer === 'deny_feedback' || answer === 'cancel' || answer === 'reject';
      return mapItem(
        resolved,
        (item) => item.kind === 'tool' && item.toolCallId === approval.approval.toolCallId,
        (item) => (item.kind === 'tool' ? { ...item, status: refused ? 'denied' : 'running' } : item),
      );
    }
    case 'turn_end': {
      const settled: SessionState = {
        ...endStreaming(state),
        running: false,
        items: endStreaming(state).items.map((item) => (item.kind === 'tool' && (item.status === 'running' || item.status === 'waiting')
          ? { ...item, status: 'error' as const }
          : item)),
      };
      const notice = outcomeNotice(event.result);
      return notice ? append(settled, (id) => ({ kind: 'notice', id, ...notice })) : settled;
    }
    default:
      return state;
  }
}
