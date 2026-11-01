import * as fs from 'fs';
import { randomUUID } from 'crypto';
import type { ChatMessage, ToolCall } from '../../types';
import {
  recordDenial,
  rememberSessionPermissionRule,
  resolveWorkspacePath,
} from '../permissions/engine';
import type { PermissionDecision, SessionPermissionMemory } from '../permissions/engine';
import { resolvePlanForApproval, writeCurrentPlanFile } from '../plan-store';
import { buildSystemPrompt } from '../prompt';
import { setMode as applyMode } from '../session';
import type { AiMode, AiSessionState, PermissionMode } from '../session';
import { buildLineDiff } from '../tools/diff';
import type { DiffLine } from '../tools/diff';
import { buildProviderToolSpecs } from '../tools/registry';
import type { ProviderToolSpec } from '../tools/registry';
import { executeToolCall, parseToolCallArguments } from '../tools/runner';
import { classifyShellCommand } from '../tools/shell';
import { resolvePlanApprovalOutcome } from '../modes';

export type ApprovalAnswer = 'allow_once' | 'allow_session' | 'deny' | 'deny_feedback' | 'cancel' | 'approve' | 'reject';

export interface FileChangeInfo {
  path: string;
  operation: 'create' | 'overwrite' | 'edit';
  added: number;
  removed: number;
  hunks: DiffLine[];
  truncated: boolean;
}

export interface ApprovalRequest {
  id: string;
  kind: 'permission' | 'plan';
  toolCallId: string;
  toolName: string;
  reason: string;
  summary?: string;
  warning?: string;
  file?: FileChangeInfo;
  plan?: string;
}

export type TurnResult =
  | { status: 'completed'; message: string; limitReached: boolean }
  | { status: 'denied' }
  | { status: 'cancelled' }
  | { status: 'plan_rejected' }
  | { status: 'error'; error: string };

export type AgentEvent =
  | { type: 'token'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'agent_event'; event: Record<string, unknown>; file?: FileChangeInfo }
  | { type: 'approval_request'; approval: ApprovalRequest }
  | { type: 'approval_resolved'; id: string; answer: ApprovalAnswer }
  | { type: 'mode_changed'; mode: AiMode; permissionMode: PermissionMode }
  | { type: 'turn_end'; result: TurnResult };

export interface CompleteHooks {
  signal: AbortSignal;
  onToken: (text: string) => void;
  onReasoning: (text: string) => void;
}

export interface AgentHostOptions {
  workspaceRoot: string;
  mode: AiMode;
  modelId: string;
  autoAccept?: boolean;
  maxToolRounds?: number;
  emit: (event: AgentEvent) => void;
  complete: (messages: ChatMessage[], tools: ProviderToolSpec[], hooks: CompleteHooks) => Promise<ChatMessage>;
}

class TurnAborted extends Error {
  constructor() {
    super('Turn cancelled');
    this.name = 'AbortError';
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const DEFAULT_MAX_TOOL_ROUNDS = 8;
const PREVIEW_LIMIT = 160;

function preview(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= PREVIEW_LIMIT ? compact : `${compact.slice(0, PREVIEW_LIMIT - 3)}...`;
}

/**
 * Drives an agent conversation for a UI. Unlike runAgentTurn it never returns at a permission request:
 * it emits an approval request and waits for resolveApproval, so one send() is one whole user turn.
 */
export class AgentHost {
  private readonly options: AgentHostOptions;
  private readonly state: Pick<AiSessionState, 'mode' | 'permissionMode' | 'autoAccept'>;
  private readonly permissions: SessionPermissionMemory = {};
  private messages: ChatMessage[] = [];
  private controller: AbortController | null = null;
  private pending: { request: ApprovalRequest; settle: (answer: ApprovalAnswer, feedback?: string) => void } | null = null;

  constructor(options: AgentHostOptions) {
    this.options = options;
    this.state = { mode: options.mode, permissionMode: 'ask', autoAccept: Boolean(options.autoAccept) };
    applyMode(this.state as AiSessionState, options.mode);
    this.messages = [this.systemMessage()];
  }

  getMode(): { mode: AiMode; permissionMode: PermissionMode } {
    return { mode: this.state.mode, permissionMode: this.state.permissionMode };
  }

  getMessages(): ChatMessage[] {
    return this.messages.map((message) => ({ ...message }));
  }

  isRunning(): boolean {
    return this.controller !== null;
  }

  setMode(mode: AiMode): void {
    if (this.controller) throw new Error('Cannot change mode while a turn is running');
    applyMode(this.state as AiSessionState, mode);
    this.refreshSystemMessage();
    this.options.emit({ type: 'mode_changed', mode: this.state.mode, permissionMode: this.state.permissionMode });
  }

  reset(): void {
    if (this.controller) throw new Error('Cannot reset while a turn is running');
    this.messages = [this.systemMessage()];
    Object.assign(this.permissions, { allowedTools: undefined, deniedTools: undefined, allowedRules: [], deniedRules: [], recentDenials: [] });
  }

  abort(): void {
    this.controller?.abort();
    // A pending approval has to settle too, or the turn would wait forever.
    this.pending?.settle('cancel');
  }

  resolveApproval(id: string, answer: ApprovalAnswer, feedback?: string): boolean {
    if (!this.pending || this.pending.request.id !== id) return false;
    const { settle } = this.pending;
    this.pending = null;
    settle(answer, feedback);
    return true;
  }

  async send(text: string): Promise<TurnResult> {
    const content = text.trim();
    if (!content) throw new Error('Message is empty');
    if (this.controller) throw new Error('A turn is already running');

    this.controller = new AbortController();
    this.messages.push({ role: 'user', content });

    let result: TurnResult;
    try {
      result = await this.runTurn(this.controller.signal);
    } catch (error) {
      result = isAbort(error)
        ? { status: 'cancelled' }
        : { status: 'error', error: error instanceof Error ? error.message : String(error) };
      this.repairTranscript();
    } finally {
      this.controller = null;
      this.pending = null;
    }
    this.options.emit({ type: 'turn_end', result });
    return result;
  }

  private systemMessage(): ChatMessage {
    const tools = this.toolSpecs();
    return {
      role: 'system',
      content: buildSystemPrompt({
        workspaceRoot: this.options.workspaceRoot,
        mode: this.state.mode,
        permissionMode: this.state.permissionMode,
        modelId: this.options.modelId,
        toolNames: tools.map((tool) => tool.function.name),
      }),
    };
  }

  private refreshSystemMessage(): void {
    this.messages[0] = this.systemMessage();
  }

  // Subagent delegation is not available in this host, so the model is never offered it.
  private toolSpecs(): ProviderToolSpec[] {
    return buildProviderToolSpecs(this.state.mode).filter((tool) => tool.function.name !== 'task');
  }

  private async runTurn(signal: AbortSignal): Promise<TurnResult> {
    const maxRounds = this.options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    const emit = this.options.emit;

    for (let round = 1; round <= maxRounds; round += 1) {
      this.throwIfAborted(signal);
      emit({ type: 'agent_event', event: { type: 'turn_start', round, messageCount: this.messages.length } });

      const assistantMessage = await this.options.complete(this.messages, this.toolSpecs(), {
        signal,
        onToken: (text) => emit({ type: 'token', text }),
        onReasoning: (text) => emit({ type: 'reasoning', text }),
      });
      this.throwIfAborted(signal);
      this.messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls || [];
      emit({
        type: 'agent_event',
        event: { type: 'assistant_message', round, content: assistantMessage.content || '', toolCallCount: toolCalls.length },
      });

      if (toolCalls.length === 0) {
        emit({ type: 'agent_event', event: { type: 'turn_complete', status: 'completed', toolResultCount: 0 } });
        return { status: 'completed', message: assistantMessage.content || '', limitReached: false };
      }

      for (const [index, toolCall] of toolCalls.entries()) {
        const outcome = await this.runToolCall(toolCall, round, signal);
        if (outcome === 'continue') continue;
        // Any tool calls left in this assistant message still need answers to keep the transcript valid.
        for (const skipped of toolCalls.slice(index + 1)) {
          this.messages.push({ role: 'tool', tool_call_id: skipped.id, content: 'Skipped: the turn ended before this tool ran.' });
        }
        return outcome;
      }
    }

    const message = `Stopped after ${maxRounds} tool rounds to avoid an infinite agent loop.`;
    this.messages.push({ role: 'assistant', content: message });
    emit({ type: 'agent_event', event: { type: 'turn_complete', status: 'max_tool_rounds', toolResultCount: 0 } });
    return { status: 'completed', message, limitReached: true };
  }

  private async runToolCall(toolCall: ToolCall, round: number, signal: AbortSignal): Promise<'continue' | TurnResult> {
    const emit = this.options.emit;
    const name = toolCall.function.name;
    emit({ type: 'agent_event', event: { type: 'tool_start', round, toolCallId: toolCall.id, toolName: name, args: toolCall.function.arguments } });

    if (name === 'exit_plan_mode') return this.runPlanExit(toolCall, round);

    // The diff has to be computed before the tool runs, while the old file content is still on disk.
    const file = this.describeFileChange(toolCall);
    const first = await executeToolCall({
      toolCall,
      mode: this.state.mode,
      permissionMode: this.state.permissionMode,
      workspaceRoot: this.options.workspaceRoot,
      session: this.permissions,
    });

    if (!first.permissionRequired) {
      this.finishToolCall(toolCall, round, first.message, first.permission, file);
      return 'continue';
    }

    const approval = await this.requestApproval(toolCall, first.permission, file, signal);
    this.throwIfAborted(signal);

    if (approval.answer === 'cancel') {
      this.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: `Permission request cancelled for ${name}.` });
      return { status: 'cancelled' };
    }
    if (approval.answer === 'deny' || approval.answer === 'deny_feedback') {
      const feedback = approval.answer === 'deny_feedback' ? approval.feedback?.trim() || 'No additional feedback provided.' : undefined;
      const content = feedback ? `Tool denied by user: ${name}. Feedback: ${feedback}` : `Tool denied by user: ${name}`;
      recordDenial(this.permissions, { toolName: name, reason: feedback ? `denied with feedback: ${feedback}` : 'denied by user' });
      this.messages.push({ role: 'tool', tool_call_id: toolCall.id, content });
      emit({
        type: 'agent_event',
        event: { type: 'tool_result', round, toolCallId: toolCall.id, toolName: name, permissionDecision: 'deny', contentPreview: preview(content) },
      });
      return feedback ? 'continue' : { status: 'denied' };
    }

    if (approval.answer === 'allow_session') {
      const rule = this.sessionRule(toolCall);
      if (rule) rememberSessionPermissionRule(this.permissions, rule);
    }
    await this.execute(toolCall, round, { decision: 'allow', reason: 'user allowed' }, file);
    return 'continue';
  }

  private async execute(toolCall: ToolCall, round: number, force: PermissionDecision, file?: FileChangeInfo): Promise<void> {
    const result = await executeToolCall({
      toolCall,
      mode: this.state.mode,
      permissionMode: this.state.permissionMode,
      workspaceRoot: this.options.workspaceRoot,
      session: this.permissions,
      forcePermissionDecision: force,
    });
    this.finishToolCall(toolCall, round, result.message, result.permission, file);
  }

  private finishToolCall(
    toolCall: ToolCall,
    round: number,
    message: ChatMessage,
    permission: PermissionDecision,
    file?: FileChangeInfo,
  ): void {
    this.messages.push(message);
    // A denied or failed call changed nothing, so it must not look like a successful edit in the UI.
    const changed = permission.decision === 'allow' && !/^Error:/.test(message.content);
    this.options.emit({
      type: 'agent_event',
      event: {
        type: 'tool_result',
        round,
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        permissionDecision: permission.decision,
        contentPreview: preview(message.content),
      },
      file: changed ? file : undefined,
    });
  }

  private describeFileChange(toolCall: ToolCall): FileChangeInfo | undefined {
    if (toolCall.function.name !== 'write_file') return undefined;
    const parsed = parseToolCallArguments(toolCall);
    if (!parsed.ok) return undefined;
    const target = typeof parsed.args.path === 'string' ? parsed.args.path : '';
    const content = typeof parsed.args.content === 'string' ? parsed.args.content : '';
    if (!target) return undefined;

    const resolved = resolveWorkspacePath(this.options.workspaceRoot, target);
    let before = '';
    let exists = false;
    try {
      before = fs.readFileSync(resolved, 'utf8');
      exists = true;
    } catch { /* new file */ }

    const diff = buildLineDiff(before, content);
    return {
      path: target,
      operation: exists ? 'overwrite' : 'create',
      added: diff.added,
      removed: diff.removed,
      hunks: diff.hunks,
      truncated: diff.truncated,
    };
  }

  private sessionRule(toolCall: ToolCall) {
    const parsed = parseToolCallArguments(toolCall);
    if (!parsed.ok) return null;
    const name = toolCall.function.name;
    if (typeof parsed.args.path === 'string' && parsed.args.path.trim()) {
      return { toolName: name, pathPrefix: resolveWorkspacePath(this.options.workspaceRoot, parsed.args.path) };
    }
    if (typeof parsed.args.command === 'string' && parsed.args.command.trim()) {
      return { toolName: name, commandPrefix: parsed.args.command.trim().split(/\s+/).slice(0, 2).join(' ') };
    }
    return null;
  }

  private requestApproval(
    toolCall: ToolCall,
    permission: PermissionDecision,
    file: FileChangeInfo | undefined,
    signal: AbortSignal,
  ): Promise<{ answer: ApprovalAnswer; feedback?: string }> {
    const parsed = parseToolCallArguments(toolCall);
    const args = parsed.ok ? parsed.args : {};
    let summary: string | undefined;
    let warning: string | undefined;
    if (toolCall.function.name === 'shell') {
      const shellArgs = Array.isArray(args.args) ? args.args.filter((item): item is string => typeof item === 'string') : [];
      const command = typeof args.command === 'string' ? args.command : '';
      summary = [command, ...shellArgs].join(' ');
      warning = classifyShellCommand(command, shellArgs).warning || undefined;
    } else if (typeof args.path === 'string') {
      summary = args.path;
    }

    const request: ApprovalRequest = {
      id: randomUUID(),
      kind: 'permission',
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      reason: permission.reason,
      summary,
      warning,
      file,
    };
    return this.waitForApproval(request, signal);
  }

  private waitForApproval(request: ApprovalRequest, signal: AbortSignal): Promise<{ answer: ApprovalAnswer; feedback?: string }> {
    return new Promise((resolve) => {
      const settle = (answer: ApprovalAnswer, feedback?: string): void => {
        this.options.emit({ type: 'approval_resolved', id: request.id, answer });
        resolve({ answer, feedback });
      };
      this.pending = { request, settle };
      if (signal.aborted) {
        this.pending = null;
        settle('cancel');
        return;
      }
      this.options.emit({ type: 'approval_request', approval: request });
    });
  }

  private async runPlanExit(toolCall: ToolCall, round: number): Promise<'continue' | TurnResult> {
    const emit = this.options.emit;
    const parsed = parseToolCallArguments(toolCall);
    const toolPlan = parsed.ok && typeof parsed.args.plan === 'string' ? parsed.args.plan : undefined;

    if (this.state.mode !== 'plan') {
      this.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'You are not in plan mode. This tool is only for exiting plan mode after writing a plan.' });
      emit({ type: 'agent_event', event: { type: 'tool_result', round, toolCallId: toolCall.id, toolName: 'exit_plan_mode', permissionDecision: 'deny', contentPreview: 'exit_plan_mode outside plan mode' } });
      return 'continue';
    }

    let plan = resolvePlanForApproval(this.options.workspaceRoot, toolPlan);
    if (!plan && toolPlan) plan = toolPlan.trim();
    if (plan) {
      try {
        writeCurrentPlanFile(this.options.workspaceRoot, plan);
      } catch { /* the plan still shows in the UI */ }
    }

    emit({ type: 'agent_event', event: { type: 'plan_approval_required', round, toolCallId: toolCall.id, planPreview: preview(plan), permissionCount: 0 } });
    const request: ApprovalRequest = {
      id: randomUUID(),
      kind: 'plan',
      toolCallId: toolCall.id,
      toolName: 'exit_plan_mode',
      reason: 'The agent finished a plan and wants to start implementing it.',
      plan,
    };
    const { answer } = await this.waitForApproval(request, this.controller!.signal);

    if (answer === 'approve') {
      this.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'Plan approved by user. Switch to agent mode and implement the approved plan.' });
      const outcome = resolvePlanApprovalOutcome(true, this.state);
      this.state.mode = outcome.mode;
      this.state.permissionMode = outcome.permissionMode;
      this.refreshSystemMessage();
      emit({ type: 'mode_changed', mode: this.state.mode, permissionMode: this.state.permissionMode });
      emit({ type: 'agent_event', event: { type: 'tool_result', round, toolCallId: toolCall.id, toolName: 'exit_plan_mode', permissionDecision: 'allow', contentPreview: 'Plan approved' } });
      return 'continue';
    }

    this.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'Plan was not approved by the user. Stay in plan mode and revise the plan.' });
    emit({ type: 'agent_event', event: { type: 'tool_result', round, toolCallId: toolCall.id, toolName: 'exit_plan_mode', permissionDecision: 'deny', contentPreview: 'Plan not approved' } });
    return answer === 'cancel' ? { status: 'cancelled' } : { status: 'plan_rejected' };
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new TurnAborted();
  }

  // After an abort or error some tool calls may be unanswered; the API rejects such a transcript.
  private repairTranscript(): void {
    const answered = new Set(this.messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id));
    const repaired: ChatMessage[] = [];
    for (const message of this.messages) {
      repaired.push(message);
      for (const call of message.tool_calls || []) {
        if (!answered.has(call.id)) {
          repaired.push({ role: 'tool', tool_call_id: call.id, content: 'Cancelled before this tool ran.' });
          answered.add(call.id);
        }
      }
    }
    this.messages = repaired;
  }
}
