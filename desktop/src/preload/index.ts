import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('zeroOneCli', {
  runCommand: (command: string) => ipcRenderer.invoke('cli:run', command),
  getLatestRelease: () => ipcRenderer.invoke('release:getLatest'),
  openLatestRelease: () => ipcRenderer.invoke('release:openLatest'),
  listInstallTargets: () => ipcRenderer.invoke('desktop-install:list'),
  runInstallTarget: (request: { key: string; latest?: boolean; confirm?: boolean }) => ipcRenderer.invoke('desktop-install:run', request),
  listSkillPackages: () => ipcRenderer.invoke('desktop-skills:list'),
  installSkillPackage: (request: { skillKey: string; targetKeys: string[]; confirm?: boolean }) => ipcRenderer.invoke('desktop-skills:install', request),
});
