import { ipcMain, shell } from 'electron';
import { killDesktopClearProcesses, scanDesktopClearProcesses } from './clear-actions';
import { runDesktopCli } from './cli-runner';
import { getLatestRelease, getReleasePageUrl } from './github-release';
import { listDesktopInstallTargets, runDesktopInstallTarget } from './install-actions';
import { createReleaseAssetAllowlist, isAllowedReleaseAssetUrl, rememberReleaseAssetUrls } from './release-assets';
import { installDesktopSkillPackage, listDesktopSkillCatalog } from './skills-actions';
import { isTrustedSender } from './trust';

// These channels need Electron or process control, so they stay in the main process instead of the shared api layer.
// Everything destructive keeps its explicit `confirm` flag, enforced again inside each action module.
export const TOOL_CHANNELS = [
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
] as const;

const UNTRUSTED = { ok: false, error: 'IPC sender is not trusted.', code: 'untrusted_sender' };

export function registerToolChannels(): void {
  const releaseAssetUrls = createReleaseAssetAllowlist();

  const handle = (channel: (typeof TOOL_CHANNELS)[number], run: (payload: any) => unknown): void => {
    ipcMain.handle(channel, (event, payload) => {
      if (!isTrustedSender(event.senderFrame?.url || '')) return UNTRUSTED;
      return run(payload);
    });
  };

  handle('cli:run', (command) => runDesktopCli(typeof command === 'string' ? command : ''));
  handle('release:getLatest', async () => {
    const release = await getLatestRelease();
    rememberReleaseAssetUrls(releaseAssetUrls, release);
    return release;
  });
  handle('release:openLatest', async () => {
    const url = getReleasePageUrl();
    await shell.openExternal(url);
    return { ok: true, url };
  });
  handle('release:openAsset', async (url) => {
    if (!isAllowedReleaseAssetUrl(releaseAssetUrls, url)) {
      return { ok: false, url: typeof url === 'string' ? url : '', error: 'Release asset is not from the latest GitHub release.' };
    }
    await shell.openExternal(url);
    return { ok: true, url };
  });
  handle('desktop-install:list', () => listDesktopInstallTargets());
  handle('desktop-install:run', (request) => runDesktopInstallTarget(request));
  handle('desktop-skills:list', () => listDesktopSkillCatalog());
  handle('desktop-skills:install', (request) => installDesktopSkillPackage(request));
  handle('desktop-clear:scan', () => scanDesktopClearProcesses());
  handle('desktop-clear:kill', (request) => killDesktopClearProcesses(request));
}
