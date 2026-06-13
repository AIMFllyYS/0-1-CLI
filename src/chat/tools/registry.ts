import { AiMode } from '../session';

export type ToolKind = 'read' | 'write' | 'shell' | 'network' | 'skill' | 'agent';

export interface ToolDefinition {
  name: string;
  kind: ToolKind;
  description: string;
  allowedModes: AiMode[];
  requiresPermission: boolean;
}

export interface ProviderToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
      required: string[];
      additionalProperties: false;
    };
  };
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'list_files',
    kind: 'read',
    description: 'List files in a directory',
    allowedModes: ['chat', 'agent', 'plan'],
    requiresPermission: false,
  },
  {
    name: 'read_file',
    kind: 'read',
    description: 'Read a UTF-8 text file',
    allowedModes: ['chat', 'agent', 'plan'],
    requiresPermission: false,
  },
  {
    name: 'search_files',
    kind: 'read',
    description: 'Search text files without invoking a shell',
    allowedModes: ['chat', 'agent', 'plan'],
    requiresPermission: false,
  },
  {
    name: 'write_file',
    kind: 'write',
    description: 'Write or edit a file',
    allowedModes: ['agent'],
    requiresPermission: true,
  },
  {
    name: 'shell',
    kind: 'shell',
    description: 'Run a shell command',
    allowedModes: ['agent'],
    requiresPermission: true,
  },
];

export function getToolDefinition(name: string): ToolDefinition {
  const found = TOOL_REGISTRY.find((tool) => tool.name === name);
  if (!found) throw new Error(`Unknown tool: ${name}`);
  return found;
}

export function toolForLegacyCommand(command: string): ToolDefinition | undefined {
  const normalized = command.toLowerCase();
  if (normalized === 'ls' || normalized === 'dir') return getToolDefinition('list_files');
  if (normalized === 'read' || normalized === 'cat' || normalized === 'type') return getToolDefinition('read_file');
  if (normalized === 'grep' || normalized === 'rg') return getToolDefinition('search_files');
  return undefined;
}

function parametersForTool(name: string): ProviderToolSpec['function']['parameters'] {
  if (name === 'list_files') {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative directory path. Defaults to current directory.' },
      },
      required: [],
      additionalProperties: false,
    };
  }
  if (name === 'read_file') {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative UTF-8 text file path.' },
      },
      required: ['path'],
      additionalProperties: false,
    };
  }
  if (name === 'search_files') {
    return {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text or regular expression to search for.' },
        path: { type: 'string', description: 'Workspace-relative file or directory path. Defaults to current directory.' },
      },
      required: ['pattern'],
      additionalProperties: false,
    };
  }
  if (name === 'write_file') {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path to write.' },
        content: { type: 'string', description: 'Complete UTF-8 file content.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    };
  }
  if (name === 'shell') {
    return {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Executable name. Do not include shell metacharacters.' },
        args: { type: 'array', description: 'Command arguments.', items: { type: 'string' } },
        cwd: { type: 'string', description: 'Workspace-relative working directory. Defaults to current directory.' },
      },
      required: ['command'],
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  };
}

export function buildProviderToolSpecs(): ProviderToolSpec[] {
  return TOOL_REGISTRY.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: parametersForTool(tool.name),
    },
  }));
}
