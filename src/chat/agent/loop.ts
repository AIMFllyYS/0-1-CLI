import { ChatMessage, ToolCall } from '../../types';
import { PermissionDecision, SessionPermissionMemory } from '../permissions/engine';
import { resolvePlanForApproval } from '../plan-store';
import { AiMode, PermissionMode } from '../session';
import { executeToolCall, ExecuteToolCallResult, parseToolCallArguments } from '../tools/runner';

export interface RunAgentTurnInput {
  messages: ChatMessage[];
  workspaceRoot: string;
  mode: AiMode;
  permissionMode: PermissionMode;
  session?: SessionPermissionMemory;
  maxToolRounds?: number;
  abortSignal?: AbortSignal;
  complete: (messages: ChatMessage[]) => Promise<ChatMessage> | ChatMessage;
  handleAgentTool?: (toolCall: ToolCall) => Promise<ChatMessage> | ChatMessage;
}

export interface AgentToolResult {
  toolCall: ToolCall;
  message: ChatMessage;
  permission: PermissionDecision;
}

export interface PlanPermissionRequest {
  action: string;
  reason?: string;
}

export type RunAgentTurnResult =
  | {
      status: 'completed';
      finalMessage: ChatMessage;
      toolResults: AgentToolResult[];
    }
  | {
      status: 'permission_required';
      pendingToolCall: ToolCall;
      permission: PermissionDecision;
      assistantMessage: ChatMessage;
      toolMessage: ChatMessage;
      toolResults: AgentToolResult[];
    }
  | {
      status: 'plan_approval_required';
      pendingToolCall: ToolCall;
      assistantMessage: ChatMessage;
      plan: string;
      permissions: PlanPermissionRequest[];
      toolResults: AgentToolResult[];
    };

function parsePlanPermissions(value: unknown): PlanPermissionRequest[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      if (typeof item.action === 'string') {
        return {
          action: item.action,
          reason: typeof item.reason === 'string' ? item.reason : undefined,
        };
      }
      if (typeof item.tool === 'string' && typeof item.prompt === 'string') {
        return {
          action: `${item.tool}: ${item.prompt}`,
          reason: 'requested during plan approval',
        };
      }
      return { action: '', reason: undefined };
    })
    .filter((item) => item.action.trim());
}

function pushToolResult(
  input: RunAgentTurnInput,
  toolResults: AgentToolResult[],
  toolCall: ToolCall,
  message: ChatMessage,
  permission: PermissionDecision,
): void {
  input.messages.push(message);
  toolResults.push({ toolCall, message, permission });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Subagent cancelled');
  error.name = 'AbortError';
  throw error;
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const toolResults: AgentToolResult[] = [];
  const maxToolRounds = input.maxToolRounds ?? 8;

  for (let round = 0; round < maxToolRounds; round += 1) {
    throwIfAborted(input.abortSignal);
    const assistantMessage = await input.complete(input.messages);
    throwIfAborted(input.abortSignal);
    input.messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls || [];
    if (toolCalls.length === 0) {
      return { status: 'completed', finalMessage: assistantMessage, toolResults };
    }

    for (const toolCall of toolCalls) {
      throwIfAborted(input.abortSignal);
      if (toolCall.function.name === 'exit_plan_mode') {
        if (input.mode !== 'plan') {
          pushToolResult(input, toolResults, toolCall, {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'You are not in plan mode. This tool is only for exiting plan mode after writing a plan.',
          }, { decision: 'deny', reason: 'exit_plan_mode outside plan mode' });
          continue;
        }

        const parsed = parseToolCallArguments(toolCall);
        if (!parsed.ok) {
          pushToolResult(input, toolResults, toolCall, {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: parsed.error,
          }, { decision: 'deny', reason: 'malformed tool arguments' });
          continue;
        }

        const args = parsed.args;
        const toolPlan = typeof args.plan === 'string' ? args.plan : undefined;
        const permissions = parsePlanPermissions(args.permissions ?? args.allowedPrompts);
        return {
          status: 'plan_approval_required',
          pendingToolCall: toolCall,
          assistantMessage,
          plan: resolvePlanForApproval(input.workspaceRoot, toolPlan),
          permissions,
          toolResults,
        };
      }

      if (toolCall.function.name === 'task' && input.mode === 'agent' && input.handleAgentTool) {
        const message = await input.handleAgentTool(toolCall);
        pushToolResult(input, toolResults, toolCall, message, { decision: 'allow', reason: 'agent task delegation' });
        continue;
      }

      const result: ExecuteToolCallResult = await executeToolCall({
        toolCall,
        mode: input.mode,
        permissionMode: input.permissionMode,
        workspaceRoot: input.workspaceRoot,
        session: input.session,
      });

      if (result.permissionRequired) {
        return {
          status: 'permission_required',
          pendingToolCall: toolCall,
          permission: result.permission,
          assistantMessage,
          toolMessage: result.message,
          toolResults,
        };
      }

      pushToolResult(input, toolResults, toolCall, result.message, result.permission);
    }
  }

  const finalMessage: ChatMessage = {
    role: 'assistant',
    content: `Stopped after ${maxToolRounds} tool rounds to avoid an infinite agent loop.`,
  };
  input.messages.push(finalMessage);
  return { status: 'completed', finalMessage, toolResults };
}
