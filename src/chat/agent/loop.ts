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
}

export interface AgentToolResult {
  toolCall: ToolCall;
  message: ChatMessage;
  permission: PermissionDecision;
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
    };

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
