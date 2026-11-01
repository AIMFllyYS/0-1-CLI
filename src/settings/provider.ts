import * as fs from 'fs';
import { maskApiKey, parseAiEnv, parseModelIds } from '../chat/config';
import { loadConfigStrict, saveConfig } from '../utils/config';

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  modelIds: string[];
  activeModelId: string;
}

// The renderer only ever receives this view; the key itself never leaves the main process.
export interface ProviderView {
  configured: boolean;
  baseUrl: string;
  apiKeyMasked: string;
  modelIds: string[];
  activeModelId: string;
}

export interface LoadProviderOptions {
  legacyEnvPath?: string;
}

function emptyProvider(): ProviderConfig {
  return { baseUrl: '', apiKey: '', modelIds: [], activeModelId: '' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fromStored(value: unknown): ProviderConfig | null {
  if (!isRecord(value)) return null;
  const modelIds = Array.isArray(value.modelIds)
    ? value.modelIds.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : [];
  const provider: ProviderConfig = {
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '',
    apiKey: typeof value.apiKey === 'string' ? value.apiKey.trim() : '',
    modelIds,
    activeModelId: typeof value.activeModelId === 'string' ? value.activeModelId.trim() : '',
  };
  return provider.baseUrl || provider.apiKey || provider.modelIds.length ? provider : null;
}

function readLegacyEnv(envPath: string | undefined): ProviderConfig | null {
  if (!envPath) return null;
  let content: string;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return null;
  }
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  const parsed = parseAiEnv(values);
  const provider: ProviderConfig = { ...parsed, modelIds: parsed.modelIds };
  return provider.baseUrl || provider.apiKey || provider.modelIds.length ? provider : null;
}

// Precedence: the user config, then a legacy .env file, then nothing.
export function loadProvider(options: LoadProviderOptions = {}): ProviderConfig {
  let stored: ProviderConfig | null = null;
  try {
    stored = fromStored(loadConfigStrict().provider);
  } catch {
    stored = null;
  }
  return stored || readLegacyEnv(options.legacyEnvPath) || emptyProvider();
}

function validate(provider: ProviderConfig): ProviderConfig {
  const baseUrl = provider.baseUrl.trim();
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`URL 无效：${baseUrl || '（空）'}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL 必须以 http:// 或 https:// 开头');
  }

  const apiKey = provider.apiKey.trim();
  if (!apiKey) throw new Error('API Key 不能为空');

  const modelIds = parseModelIds(provider.modelIds.join(','));
  if (modelIds.length === 0) throw new Error('至少需要一个模型 ID');

  const activeModelId = provider.activeModelId.trim() || modelIds[0];
  if (!modelIds.includes(activeModelId)) throw new Error('当前模型必须在模型列表中');

  return { baseUrl, apiKey, modelIds, activeModelId };
}

export function saveProvider(provider: ProviderConfig): void {
  const valid = validate(provider);
  const config = loadConfigStrict();
  config.provider = valid;
  saveConfig(config);
}

// A blank API key means "keep the stored one", so the UI never has to hold the secret.
export function updateProvider(input: ProviderConfig): void {
  const current = loadProvider();
  saveProvider({ ...input, apiKey: input.apiKey.trim() || current.apiKey });
}

export function describeProvider(options: LoadProviderOptions = {}): ProviderView {
  const provider = loadProvider(options);
  return {
    configured: Boolean(provider.baseUrl && provider.apiKey && provider.modelIds.length),
    baseUrl: provider.baseUrl,
    apiKeyMasked: provider.apiKey ? maskApiKey(provider.apiKey) : '',
    modelIds: provider.modelIds,
    activeModelId: provider.activeModelId,
  };
}

// Existing environment variables win, so a shell override or a .env value still behaves as before.
export function applyProviderToEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>, options: LoadProviderOptions = {}): void {
  const provider = loadProvider(options);
  const assign = (key: string, value: string): void => {
    if (value && !env[key]) env[key] = value;
  };
  assign('AI_BASE_URL', provider.baseUrl);
  assign('AI_API_KEY', provider.apiKey);
  assign('AI_MODELS', provider.modelIds.join(','));
  assign('AI_MODEL', provider.activeModelId);
}
