import { PermissionMode } from '../session';
import { SubagentQueue, SubagentResult, SubagentTask, SubagentTaskInput } from './types';

export type AgentCommand =
  | { kind: 'mode' }
  | { kind: 'list' }
  | { kind: 'spawn'; prompt: string }
  | { kind: 'cancel'; id: string }
  | { kind: 'unknown'; value: string };

const PERMISSION_RANK: Record<PermissionMode, number> = {
  plan: 0,
  ask: 1,
  bypass: 2,
};

export function narrowPermission(parent: PermissionMode, requested?: PermissionMode): PermissionMode {
  if (!requested) return parent === 'bypass' ? 'ask' : parent;
  return PERMISSION_RANK[requested] <= PERMISSION_RANK[parent] ? requested : parent;
}

export function createSubagentQueue(options: { parentPermissionMode: PermissionMode }): SubagentQueue {
  return {
    parentPermissionMode: options.parentPermissionMode,
    nextId: 1,
    items: [],
  };
}

export function setSubagentParentPermission(queue: SubagentQueue, permissionMode: PermissionMode): void {
  queue.parentPermissionMode = permissionMode;
}

export function enqueueSubagent(queue: SubagentQueue, input: SubagentTaskInput): SubagentTask {
  const task: SubagentTask = {
    id: `sub-${queue.nextId++}`,
    status: 'queued',
    prompt: input.prompt,
    mode: input.mode || 'agent',
    permissionMode: narrowPermission(queue.parentPermissionMode, input.permissionMode),
    allowedTools: input.allowedTools || [],
    skillIds: input.skillIds || [],
    modelId: input.modelId,
    createdAt: Date.now(),
  };
  queue.items.push(task);
  return task;
}

export function cancelSubagent(queue: SubagentQueue, id: string): SubagentTask {
  const task = queue.items.find((item) => item.id === id);
  if (!task) throw new Error(`Unknown subagent: ${id}`);
  if (task.status === 'completed' || task.status === 'failed') return task;
  task.status = 'cancelled';
  task.completedAt = Date.now();
  return task;
}

export async function runNextSubagent(
  queue: SubagentQueue,
  handler: (task: SubagentTask) => Promise<SubagentResult> | SubagentResult = defaultSubagentHandler
): Promise<SubagentTask> {
  const task = queue.items.find((item) => item.status === 'queued');
  if (!task) throw new Error('No queued subagents');

  task.status = 'running';
  task.startedAt = Date.now();

  try {
    const result = await handler(task);
    const current = queue.items.find((item) => item.id === task.id) || task;
    if (current.status === 'cancelled') return current;
    task.status = 'completed';
    task.result = normalizeResult(result);
    task.completedAt = Date.now();
    return task;
  } catch (error: any) {
    const current = queue.items.find((item) => item.id === task.id) || task;
    if (current.status === 'cancelled') return current;
    task.status = 'failed';
    task.error = error?.message || String(error);
    task.completedAt = Date.now();
    return task;
  }
}

export function formatSubagentList(queue: SubagentQueue): string {
  if (!queue.items.length) return 'No subagents.';
  return queue.items.map((task) => {
    const summary = task.result?.summary ? ` - ${task.result.summary}` : '';
    return `${task.id} [${task.status}] ${task.permissionMode}: ${task.prompt}${summary}`;
  }).join('\n');
}

export function resolveAgentCommand(args: string): AgentCommand {
  const trimmed = args.trim();
  if (!trimmed) return { kind: 'mode' };
  const [command, ...rest] = trimmed.split(/\s+/);
  const normalized = command.toLowerCase();
  if (normalized === 'list' || normalized === 'ls') return { kind: 'list' };
  if (normalized === 'spawn') return { kind: 'spawn', prompt: rest.join(' ').trim() };
  if (normalized === 'cancel') return { kind: 'cancel', id: rest.join(' ').trim() };
  return { kind: 'unknown', value: trimmed };
}

function normalizeResult(result: SubagentResult): SubagentResult {
  return {
    summary: result.summary || 'Subagent completed.',
    notes: result.notes || [],
  };
}

function defaultSubagentHandler(task: SubagentTask): SubagentResult {
  return {
    summary: `Queued local subagent task: ${task.prompt}`,
    notes: [
      `permissionMode=${task.permissionMode}`,
      task.allowedTools.length ? `allowedTools=${task.allowedTools.join(',')}` : 'allowedTools=none',
    ],
  };
}

export type { SubagentQueue, SubagentResult, SubagentStatus, SubagentTask, SubagentTaskInput } from './types';
