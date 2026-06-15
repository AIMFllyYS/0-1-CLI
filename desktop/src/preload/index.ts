import { contextBridge, ipcRenderer } from 'electron';
import { validateDesktopCommand } from '../main/permissions';

contextBridge.exposeInMainWorld('zeroOneCli', {
  runCommand: (command: string) => {
    const validation = validateDesktopCommand(command);
    if (!validation.allowed) {
      return Promise.resolve({ ok: false, output: validation.reason || `Command not allowed: ${command}` });
    }
    return ipcRenderer.invoke('cli:run', command);
  },
  launchAiSession: (request?: { mode?: 'chat' | 'agent' | 'plan' }) => ipcRenderer.invoke('ai:launch', request || {}),
  getLatestRelease: () => ipcRenderer.invoke('release:getLatest'),
  openLatestRelease: () => ipcRenderer.invoke('release:openLatest'),
  openReleaseAsset: (url: string) => ipcRenderer.invoke('release:openAsset', url),
  listInstallTargets: () => ipcRenderer.invoke('desktop-install:list'),
  runInstallTarget: (request: { key: string; latest?: boolean; confirm?: boolean }) => ipcRenderer.invoke('desktop-install:run', request),
  listSkillPackages: () => ipcRenderer.invoke('desktop-skills:list'),
  installSkillPackage: (request: { skillKey: string; targetKeys: string[]; confirm?: boolean }) => ipcRenderer.invoke('desktop-skills:install', request),
  scanClearProcesses: () => ipcRenderer.invoke('desktop-clear:scan'),
  killClearProcesses: (request: { pids: number[]; confirm?: boolean }) => ipcRenderer.invoke('desktop-clear:kill', request),
});
