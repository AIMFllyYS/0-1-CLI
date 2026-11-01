import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import * as path from 'path';
import { resolveRuntimeRoot } from './runtime';
import { registerToolChannels } from './tools-ipc';
import { isAllowedRendererUrl, isTrustedSender } from './trust';
import { REQUEST_CHANNELS } from '../shared/channels';
import type { DesktopApiHandle } from './runtime';

let mainWindow: BrowserWindow | null = null;
let api: DesktopApiHandle | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 880,
    minHeight: 600,
    title: '0-1 CLI',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  // Show once painted, so the user never sees a blank window while the renderer loads.
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Links open in the system browser; the app window itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url) && !url.startsWith('file:')) event.preventDefault();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    if (!isAllowedRendererUrl(devUrl)) throw new Error('VITE_DEV_SERVER_URL must point to localhost.');
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }
}

function sendToRenderer(channel: 'ai:event', payload: unknown): void {
  const win = mainWindow;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function registerIpc(handle: DesktopApiHandle): void {
  for (const channel of REQUEST_CHANNELS) {
    ipcMain.handle(channel, (event, payload) => {
      if (!isTrustedSender(event.senderFrame?.url || '')) {
        return { ok: false, error: 'IPC sender is not trusted.', code: 'untrusted_sender' };
      }
      return handle.invoke(channel, payload);
    });
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    // The renderer is a local page; deny every permission prompt it could raise.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

    api = await createApi();
    registerIpc(api);
    registerToolChannels();
    await api.init();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    api?.dispose();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

async function createApi(): Promise<DesktopApiHandle> {
  const { createDesktopApi } = require(path.join(resolveRuntimeRoot(), 'desktop', 'api.js'));
  const { launchEntry } = require(path.join(resolveRuntimeRoot(), 'modules', 'launch', 'terminal.js'));
  const { applyProviderToEnv } = require(path.join(resolveRuntimeRoot(), 'settings', 'provider.js'));

  // Fill any variable the environment left unset from the saved credentials before the first request.
  applyProviderToEnv(process.env);

  return createDesktopApi({
    version: app.getVersion(),
    emit: (channel: 'ai:event', payload: unknown) => sendToRenderer(channel, payload),
    chooseDirectory: async () => {
      const options = { title: '选择工作目录', properties: ['openDirectory' as const] };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? undefined : result.filePaths[0];
    },
    setLoginItem: (enabled: boolean) => {
      // A development build would register the bare electron binary, not the app, so refuse it.
      if (!app.isPackaged) {
        if (enabled) throw new Error('开机启动只在安装版中可用');
        return;
      }
      app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    },
    getLoginItem: () => (app.isPackaged ? app.getLoginItemSettings().openAtLogin : false),
    runLaunch: (entry: unknown) => launchEntry(entry),
  });
}
