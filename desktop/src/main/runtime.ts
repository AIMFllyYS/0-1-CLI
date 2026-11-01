import { app } from 'electron';
import * as path from 'path';

export interface DesktopApiHandle {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  init: () => Promise<void>;
  dispose: () => void;
}

// The CLI runtime (compiled from src/) ships next to the app. In development it is the repository's dist folder.
export function resolveRuntimeRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'cli')
    : path.resolve(__dirname, '..', '..', '..', 'dist');
}
