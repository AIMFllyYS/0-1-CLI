import { ChatMessage } from '../../types';
import { SubagentTask } from './types';

function formatList(label: string, values: string[] | undefined): string {
  return `${label}=${values && values.length ? values.join(',') : 'none'}`;
}

export function buildSubagentMessages(task: Pick<SubagentTask, 'prompt' | 'mode' | 'permissionMode' | 'allowedTools' | 'disallowedTools' | 'skillIds' | 'modelId' | 'currentPlan' | 'currentPlanPath' | 'agentType' | 'agentSystemPrompt'>): ChatMessage[] {
  const system = [
    '# Subagent Runtime',
    'You are a scoped local subagent inside 0-1 CLI.',
    'Work only on the delegated task. Do not change files unless the active mode and permission mode allow it.',
    'Inspect relevant context first, keep findings concise, and return a summary plus concrete notes.',
    '',
    '# Parent Context',
    `mode=${task.mode}`,
    `permissionMode=${task.permissionMode}`,
    `modelId=${task.modelId || 'default'}`,
    `agentType=${task.agentType || 'general-purpose'}`,
    formatList('allowedTools', task.allowedTools),
    formatList('disallowedTools', task.disallowedTools),
    formatList('skillIds', task.skillIds),
    '',
    '# Current Plan',
    task.currentPlanPath ? `Plan file: ${task.currentPlanPath}` : 'Plan file: none',
    task.currentPlan?.trim() || 'none',
    task.agentSystemPrompt?.trim()
      ? ['', '# Agent Definition', task.agentSystemPrompt.trim()].join('\n')
      : '',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Delegated task:\n${task.prompt}` },
  ];
}
