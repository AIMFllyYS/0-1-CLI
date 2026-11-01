import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

// Sandboxed preload scripts may only require 'electron', so this file imports nothing local and holds its own
// channel list. The main process validates every payload; nothing here is a security boundary on its own.
const REQUEST_CHANNELS = new Set<string>([
  'cli:run',
  'release:getLatest',
  'release:openLatest',
  'release:openAsset',
  'desktop-install:list',
  'desktop-install:run',
  'desktop-skills:list',
  'desktop-skills:install',
  'desktop-clear:scan',
  'desktop-clear:kill',
  'app:getState',
  'settings:set',
  'settings:reset',
  'provider:save',
  'workspace:choose',
  'workspace:set',
  'github:summary',
  'launch:list',
  'launch:run',
  'ai:createSession',
  'ai:send',
  'ai:approve',
  'ai:abort',
  'ai:setMode',
  'ai:reset',
  'ai:close',
]);

contextBridge.exposeInMainWorld('zeroOneCli', {
  invoke: (channel: string, payload?: unknown): Promise<unknown> => {
    if (typeof channel !== 'string' || !REQUEST_CHANNELS.has(channel)) {
      return Promise.resolve({ ok: false, error: `Unknown channel: ${String(channel)}`, code: 'unknown_channel' });
    }
    return ipcRenderer.invoke(channel, payload);
  },
  // Subscribe to streamed agent events. Returns an unsubscribe function; ipcRenderer itself is never exposed.
  onAiEvent: (callback: (payload: unknown) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown): void => callback(payload);
    ipcRenderer.on('ai:event', listener);
    return () => {
      ipcRenderer.removeListener('ai:event', listener);
    };
  },
});
