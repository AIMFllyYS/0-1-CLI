import type { SubagentQueue } from './agent/types';

export type AiMode = 'chat' | 'agent' | 'plan';
export type PermissionMode = 'ask' | 'bypass' | 'plan';

export interface SessionOptions {
  modelId: string;
  autoAccept?: boolean;
}

export interface AiSessionState {
  mode: AiMode;
  permissionMode: PermissionMode;
  currentModelId: string;
  autoAccept: boolean;
  inSubmenu: boolean;
  activeSkillIds: string[];
  subagents?: SubagentQueue;
}

export function createSessionState(options: SessionOptions): AiSessionState {
  return {
    mode: options.autoAccept ? 'agent' : 'chat',
    permissionMode: options.autoAccept ? 'bypass' : 'ask',
    currentModelId: options.modelId,
    autoAccept: Boolean(options.autoAccept),
    inSubmenu: false,
    activeSkillIds: [],
  };
}

export function setMode(state: AiSessionState, mode: AiMode): AiSessionState {
  state.mode = mode;
  if (mode === 'plan') {
    state.permissionMode = 'plan';
  } else if (mode === 'agent' && state.autoAccept) {
    state.permissionMode = 'bypass';
  } else {
    state.permissionMode = 'ask';
  }
  return state;
}

export function setCurrentModel(state: AiSessionState, modelId: string): AiSessionState {
  state.currentModelId = modelId;
  return state;
}

export function describeMode(state: AiSessionState): string {
  return `${state.mode} / ${state.permissionMode}`;
}
