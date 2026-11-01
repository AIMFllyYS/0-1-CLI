import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { Bridge } from './state/store';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/chat.css';
import './styles/pages.css';
import 'highlight.js/styles/github.css';

async function resolveBridge(): Promise<Bridge | undefined> {
  const real = (window as unknown as { zeroOneCli?: Bridge }).zeroOneCli;
  if (real) return real;
  // Outside Electron there is no bridge. Only the dev server may fall back to the preview mock, and the
  // dynamic import keeps the mock out of the production bundle.
  if (import.meta.env.DEV) {
    const { createMockBridge } = await import('./dev/mock-bridge');
    return createMockBridge();
  }
  return undefined;
}

void resolveBridge().then((bridge) => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App bridge={bridge} />
    </React.StrictMode>,
  );
});
