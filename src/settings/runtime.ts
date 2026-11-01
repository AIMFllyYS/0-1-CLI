import type { AiDefaultMode, Settings } from './schema';

export interface StartFlags {
  modelId?: string;
  autoAccept?: boolean;
}

export interface ResolvedStartOptions {
  mode: AiDefaultMode;
  modelId: string | undefined;
  autoAccept: boolean;
  maxToolRounds: number;
}

// Precedence: explicit command line flags, then saved settings, then built-in defaults.
export function resolveStartOptions(flags: StartFlags, settings: Settings): ResolvedStartOptions {
  const autoAccept = flags.autoAccept === true || settings.ai.autoAccept;

  return {
    // The --auto-accept flag has always meant "start in agent mode"; the saved setting does not change the mode.
    mode: flags.autoAccept === true ? 'agent' : settings.ai.defaultMode,
    modelId: flags.modelId || settings.ai.defaultModelId || undefined,
    autoAccept,
    maxToolRounds: settings.ai.maxToolRounds,
  };
}
