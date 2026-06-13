import { AiMode, PermissionMode } from '../session';

export type SubagentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubagentTaskInput {
  prompt: string;
  mode?: AiMode;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  skillIds?: string[];
  modelId?: string;
}

export interface SubagentResult {
  summary: string;
  notes: string[];
}

export interface SubagentTask extends Required<Pick<SubagentTaskInput, 'prompt'>> {
  id: string;
  status: SubagentStatus;
  mode: AiMode;
  permissionMode: PermissionMode;
  allowedTools: string[];
  skillIds: string[];
  modelId?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: SubagentResult;
  error?: string;
}

export interface SubagentQueue {
  parentPermissionMode: PermissionMode;
  nextId: number;
  items: SubagentTask[];
}
