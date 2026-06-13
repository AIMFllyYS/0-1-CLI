import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { runDesktopCli } from './cli-runner';
import { getLatestRelease, getReleasePageUrl } from './github-release';
import { listDesktopInstallTargets, runDesktopInstallTarget } from './install-actions';
import { installDesktopSkillPackage, listDesktopSkillCatalog } from './skills-actions';

function isAllowedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: '0-1 CLI',
    backgroundColor: '#101113',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    if (!isAllowedRendererUrl(devUrl)) throw new Error('VITE_DEV_SERVER_URL must point to localhost.');
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
}

function isTrustedSender(value: string): boolean {
  return value.startsWith('file:') || isAllowedRendererUrl(value);
}

app.whenReady().then(() => {
  ipcMain.handle('cli:run', (event, command: string) => {
    const senderUrl = event.senderFrame?.url || '';
    if (isTrustedSender(senderUrl)) {
      return runDesktopCli(command);
    }
    return { ok: false, output: 'IPC sender is not trusted.' };
  });
  ipcMain.handle('release:getLatest', (event) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, repo: 'AIMFllyYS/0-1-CLI', error: 'IPC sender is not trusted.' };
    }
    return getLatestRelease();
  });
  ipcMain.handle('release:openLatest', async (event) => {
    const senderUrl = event.senderFrame?.url || '';
    const url = getReleasePageUrl();
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, url, error: 'IPC sender is not trusted.' };
    }
    await shell.openExternal(url);
    return { ok: true, url };
  });
  ipcMain.handle('desktop-install:list', (event) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) return [];
    return listDesktopInstallTargets();
  });
  ipcMain.handle('desktop-install:run', (event, request) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, output: 'IPC sender is not trusted.' };
    }
    return runDesktopInstallTarget(request);
  });
  ipcMain.handle('desktop-skills:list', (event) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) return { packages: [], targets: [] };
    return listDesktopSkillCatalog();
  });
  ipcMain.handle('desktop-skills:install', (event, request) => {
    const senderUrl = event.senderFrame?.url || '';
    if (!isTrustedSender(senderUrl)) {
      return { ok: false, output: 'IPC sender is not trusted.' };
    }
    return installDesktopSkillPackage(request);
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
