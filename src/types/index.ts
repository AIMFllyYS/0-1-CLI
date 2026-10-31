// === Model & Provider Types ===

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'deepseek' | 'zhipu' | 'custom';
  description: string;
  source?: 'builtin' | 'custom';
  supportsSearch?: boolean;
  supportsTools?: boolean;
  openAiCompatible?: boolean;
  contextLength?: number;
  modalities?: string[];
}

export interface ProviderConfig {
  name: string;
  protocol?: 'http:' | 'https:';
  hostname: string;
  port?: string;
  path: string;
  key: string;
  modelId: string;
}

// === Chat Types ===

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface SearchResult {
  title: string;
  content: string;
  link: string;
  media?: string;
  publish_date?: string;
}

export interface WebSearchResponse {
  id: string;
  search_result: SearchResult[];
}

// === Launch Registry Types ===

export type LaunchShell = 'cmd' | 'powershell';

export interface LaunchStart {
  kind: 'command' | 'script';
  value: string;
}

export interface LaunchEntry {
  id: string;
  name: string;
  path: string;
  start?: LaunchStart;
  shell: LaunchShell;
  keepOpen: boolean;
}

// === Tool Execution Types ===

export interface ToolResult {
  name: string;
  content: string;
}
