import { ChatMessage, ToolCall } from '../../types';
import { PermissionDecision, SessionPermissionMemory } from '../permissions/engine';
import { AiMode, PermissionMode } from '../session';
import { executeToolCall, ExecuteToolCallResult } from '../tools/runner';

export interface RunAgentTurnInput {
  messages: ChatMessage[];
  workspaceRoot: string;
  mode: AiMode;
  permissionMode: PermissionMode;
  session?: SessionPermissionMemory;
  maxToolRounds?: number;
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

function parseToolArguments(toolCall: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(toolCall.function.arguments || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parsePlanPermissions(value: unknown): PlanPermissionRequest[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      action: typeof item.action === 'string' ? item.action : '',
      reason: typeof item.reason === 'string' ? item.reason : undefined,
    }))
    .filter((item) => item.action.trim());
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const toolResults: AgentToolResult[] = [];
  const maxToolRounds = input.maxToolRounds ?? 8;

  for (let round = 0; round < maxToolRounds; round += 1) {
    const assistantMessage = await input.complete(input.messages);
    input.messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls || [];
    if (toolCalls.length === 0) {
      return { status: 'completed', finalMessage: assistantMessage, toolResults };
    }

    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'exit_plan_mode' && input.mode === 'plan') {
        const args = parseToolArguments(toolCall);
        return {
          status: 'plan_approval_required',
          pendingToolCall: toolCall,
          assistantMessage,
          plan: typeof args.plan === 'string' ? args.plan : '',
          permissions: parsePlanPermissions(args.permissions),
          toolResults,
        };
      }

      if (toolCall.function.name === 'task' && input.mode === 'agent' && input.handleAgentTool) {
        const message = await input.handleAgentTool(toolCall);
        input.messages.push(message);
        toolResults.push({
          toolCall,
          message,
          permission: { decision: 'allow', reason: 'agent task delegation' },
        });
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

      input.messages.push(result.message);
      toolResults.push({
        toolCall,
        message: result.message,
        permission: result.permission,
      });
    }
  }

  const finalMessage: ChatMessage = {
    role: 'assistant',
    content: `Stopped after ${maxToolRounds} tool rounds to avoid an infinite agent loop.`,
  };
  input.messages.push(finalMessage);
  return { status: 'completed', finalMessage, toolResults };
}
