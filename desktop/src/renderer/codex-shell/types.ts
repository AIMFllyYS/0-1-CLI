import type { DesktopAction } from '../action-catalog';

export type Mode = 'chat' | 'agent' | 'plan';
export type InspectorTab = 'plan' | 'tools' | 'diff' | 'preview' | 'settings';
export type InstallCategory = 'cli' | 'ide' | 'environment';
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ConversationSession {
  id: string;
  title: string;
  subtitle: string;
  status: 'active' | 'ready' | 'queued';
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  meta?: string;
}

export interface ActivityItem {
  title: string;
  status: string;
  detail: string;
}

export interface InstallTarget {
  key: string;
  displayName: string;
  category: InstallCategory;
  description: string;
  sourceUrl: string;
  opensUrlOnly?: boolean;
}

export interface SkillPackage {
  key: string;
  displayName: string;
  description: string;
  sourceUrl: string;
  sourceType: 'local' | 'git';
}

export interface SkillTarget {
  key: string;
  displayName: string;
  path: string;
  detected: boolean;
}

export interface ClearProcess {
  pid: number;
  name: string;
  memoryMB: number;
  cpuSeconds: number;
  path?: string;
  windowTitle?: string;
  reason: string;
}

export interface ReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

export interface ReleaseInfo {
  ok: boolean;
  tagName?: string;
  name?: string;
  htmlUrl?: string;
  publishedAt?: string;
  assets?: ReleaseAsset[];
  error?: string;
}

export interface DesktopAiRequest {
  sessionId: string;
  mode: Mode;
  text: string;
}

export interface DesktopAiResponse {
  ok: boolean;
  message?: ConversationMessage;
  activity?: ActivityItem[];
  output?: string;
  error?: string;
}

export interface DesktopBridge {
  runCommand: (command: string) => Promise<{ ok: boolean; output: string }>;
  launchAiSession: (request?: { mode?: Mode }) => Promise<{ ok: boolean; output: string }>;
  sendAiMessage: (request: DesktopAiRequest) => Promise<DesktopAiResponse>;
  getLatestRelease: () => Promise<ReleaseInfo>;
  openLatestRelease: () => Promise<{ ok: boolean; url: string; error?: string }>;
  openReleaseAsset: (url: string) => Promise<{ ok: boolean; url: string; error?: string }>;
  listInstallTargets: () => Promise<InstallTarget[]>;
  runInstallTarget: (request: { key: string; latest?: boolean; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
  listSkillPackages: () => Promise<{ packages: SkillPackage[]; targets: SkillTarget[] }>;
  installSkillPackage: (request: { skillKey: string; targetKeys: string[]; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
  scanClearProcesses: () => Promise<{ ok: boolean; processes: ClearProcess[]; total: number; filtered: number; output: string }>;
  killClearProcesses: (request: { pids: number[]; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
}

export type ActiveActionId = DesktopAction['id'] | null;

declare global {
  interface Window {
    zeroOneCli?: DesktopBridge;
  }
}
