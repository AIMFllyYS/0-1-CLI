export type AiDefaultMode = 'chat' | 'agent' | 'plan';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  ai: {
    defaultMode: AiDefaultMode;
    defaultModelId: string;
    autoAccept: boolean;
    maxToolRounds: number;
  };
  github: {
    prefetch: boolean;
  };
  startup: {
    cliAutostart: boolean;
    desktopAutostart: boolean;
  };
  appearance: {
    theme: ThemeChoice;
  };
}

export type SettingKind = 'boolean' | 'enum' | 'integer' | 'string';

export interface SettingDef {
  key: string;
  kind: SettingKind;
  description: string;
  options?: readonly string[];
  min?: number;
  max?: number;
  default: boolean | number | string;
}

export const MAX_TOOL_ROUNDS_RANGE = { min: 1, max: 50 } as const;

export const SETTING_DEFS: readonly SettingDef[] = [
  {
    key: 'ai.defaultMode',
    kind: 'enum',
    options: ['chat', 'agent', 'plan'],
    default: 'chat',
    description: '启动 AI 对话时的默认模式',
  },
  {
    key: 'ai.defaultModelId',
    kind: 'string',
    default: '',
    description: '默认模型 ID，留空则沿用 /setting 里选择的模型',
  },
  {
    key: 'ai.autoAccept',
    kind: 'boolean',
    default: false,
    description: 'Agent 模式下自动接受工具权限确认（危险命令仍会拦截）',
  },
  {
    key: 'ai.maxToolRounds',
    kind: 'integer',
    ...MAX_TOOL_ROUNDS_RANGE,
    default: 8,
    description: '单轮对话里 Agent 最多连续调用工具的轮数',
  },
  {
    key: 'github.prefetch',
    kind: 'boolean',
    default: true,
    description: '启动状态页和桌面首页时先读取 GitHub 账号与 Issues（只读，不上传本地信息）',
  },
  {
    key: 'startup.cliAutostart',
    kind: 'boolean',
    default: false,
    description: '开机时在新终端里打开 hi',
  },
  {
    key: 'startup.desktopAutostart',
    kind: 'boolean',
    default: false,
    description: '登录系统后自动打开桌面应用',
  },
  {
    key: 'appearance.theme',
    kind: 'enum',
    options: ['system', 'light', 'dark'],
    default: 'system',
    description: '桌面应用主题，system 跟随系统',
  },
];

export function findSettingDef(key: string): SettingDef {
  const def = SETTING_DEFS.find((item) => item.key === key);
  if (!def) {
    throw new Error(`未知设置项：${key}（可用：${SETTING_DEFS.map((item) => item.key).join(', ')}）`);
  }
  return def;
}

export function defaultSettings(): Settings {
  const value = (key: string) => findSettingDef(key).default;
  return {
    ai: {
      defaultMode: value('ai.defaultMode') as AiDefaultMode,
      defaultModelId: value('ai.defaultModelId') as string,
      autoAccept: value('ai.autoAccept') as boolean,
      maxToolRounds: value('ai.maxToolRounds') as number,
    },
    github: { prefetch: value('github.prefetch') as boolean },
    startup: {
      cliAutostart: value('startup.cliAutostart') as boolean,
      desktopAutostart: value('startup.desktopAutostart') as boolean,
    },
    appearance: { theme: value('appearance.theme') as ThemeChoice },
  };
}

const TRUE_WORDS = new Set(['true', 'on', 'yes', 'y', '1', '开', '是', '启用', '开启']);
const FALSE_WORDS = new Set(['false', 'off', 'no', 'n', '0', '关', '否', '禁用', '关闭']);

export function parseSettingValue(def: SettingDef, raw: string): boolean | number | string {
  const text = raw.trim();

  if (def.kind === 'boolean') {
    const word = text.toLowerCase();
    if (TRUE_WORDS.has(word)) return true;
    if (FALSE_WORDS.has(word)) return false;
    throw new Error(`${def.key} 是开关，请用 on/off、true/false 或 开/关`);
  }

  if (def.kind === 'enum') {
    const word = text.toLowerCase();
    if (!def.options?.includes(word)) {
      throw new Error(`${def.key} 只能是：${def.options?.join(' / ')}`);
    }
    return word;
  }

  if (def.kind === 'integer') {
    if (!/^-?\d+$/.test(text)) throw new Error(`${def.key} 必须是整数`);
    const value = Number(text);
    if (value < (def.min ?? -Infinity) || value > (def.max ?? Infinity)) {
      throw new Error(`${def.key} 必须在 ${def.min} 到 ${def.max} 之间`);
    }
    return value;
  }

  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validate(def: SettingDef, value: unknown): boolean | number | string {
  if (def.kind === 'boolean') return typeof value === 'boolean' ? value : (def.default as boolean);
  if (def.kind === 'string') return typeof value === 'string' ? value.trim() : (def.default as string);
  if (def.kind === 'enum') {
    return typeof value === 'string' && def.options?.includes(value) ? value : (def.default as string);
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= (def.min ?? -Infinity) && value <= (def.max ?? Infinity)) {
    return value;
  }
  return def.default as number;
}

// Each key falls back independently, so one bad value never discards the rest.
export function sanitizeSettings(input: unknown): Settings {
  const result = defaultSettings();
  if (!isRecord(input)) return result;

  const target = result as unknown as Record<string, Record<string, unknown>>;
  for (const def of SETTING_DEFS) {
    const [group, name] = def.key.split('.');
    const section = input[group];
    if (isRecord(section) && name in section) {
      target[group][name] = validate(def, section[name]);
    }
  }
  return result;
}

export function getSettingValue(settings: Settings, key: string): boolean | number | string {
  findSettingDef(key);
  const [group, name] = key.split('.');
  return (settings as unknown as Record<string, Record<string, boolean | number | string>>)[group][name];
}

export function setSettingValue(settings: Settings, key: string, value: boolean | number | string): Settings {
  findSettingDef(key);
  const [group, name] = key.split('.');
  const next = sanitizeSettings(settings) as unknown as Record<string, Record<string, unknown>>;
  next[group][name] = value;
  return next as unknown as Settings;
}
