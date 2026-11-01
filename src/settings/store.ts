import { loadConfigStrict, saveConfig } from '../utils/config';
import { disableAutostart, enableAutostart } from './autostart';
import {
  defaultSettings,
  findSettingDef,
  getSettingValue,
  parseSettingValue,
  sanitizeSettings,
  setSettingValue,
} from './schema';
import type { Settings } from './schema';

export interface UpdateResult {
  key: string;
  value: boolean | number | string;
  warning?: string;
}

// Reading never throws: a missing or unreadable file means defaults.
export function loadSettings(): Settings {
  try {
    return sanitizeSettings(loadConfigStrict().settings);
  } catch {
    return defaultSettings();
  }
}

// Applies the OS-side effect first, so a failure leaves the stored value unchanged.
function applySideEffects(key: string, value: boolean | number | string): void {
  if (key !== 'startup.cliAutostart') return;
  if (value === true) enableAutostart();
  else disableAutostart();
}

export function updateSetting(key: string, raw: string): UpdateResult {
  const def = findSettingDef(key);
  const value = parseSettingValue(def, raw);
  const config = loadConfigStrict();

  applySideEffects(key, value);

  config.settings = setSettingValue(sanitizeSettings(config.settings), key, value);
  saveConfig(config);

  const result: UpdateResult = { key, value };
  if (key === 'ai.autoAccept' && value === true) {
    result.warning = '已开启自动接受：Agent 将不再逐项询问工具权限，请只在可信的工作目录中使用。';
  }
  return result;
}

export function resetSetting(key?: string): void {
  const config = loadConfigStrict();
  const current = sanitizeSettings(config.settings);

  if (key === undefined) {
    applySideEffects('startup.cliAutostart', false);
    config.settings = defaultSettings();
  } else {
    const def = findSettingDef(key);
    applySideEffects(key, def.default);
    config.settings = setSettingValue(current, key, def.default);
  }
  saveConfig(config);
}

export function getSetting(key: string): boolean | number | string {
  return getSettingValue(loadSettings(), key);
}
