import React, { useEffect, useMemo } from 'react';
import { StoreContext, useAppState, useShortcut, useStore, useSystemDark } from './hooks';
import { createStore } from './state/store';
import type { Bridge } from './state/store';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Toast';
import { ChatPage } from './components/ChatPage';
import { LaunchPage } from './components/LaunchPage';
import { SettingsPage } from './components/SettingsPage';
import { ToolsPage } from './components/ToolsPage';

function Page(): React.ReactElement {
  const state = useAppState();
  if (state.fatal) {
    return (
      <div className="fatal" role="alert">
        <h1>应用没能正常启动</h1>
        <p>{state.fatal}</p>
      </div>
    );
  }
  if (!state.ready) return <p className="loading" role="status">正在加载…</p>;
  if (state.page === 'launch') return <LaunchPage />;
  if (state.page === 'tools') return <ToolsPage />;
  if (state.page === 'settings') return <SettingsPage />;
  return <ChatPage />;
}

function Shell(): React.ReactElement {
  const store = useStore();
  const state = useAppState();
  const systemDark = useSystemDark();
  const theme = store.resolvedTheme(systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void store.init();
    return () => store.dispose();
  }, [store]);

  const ctrl = (event: KeyboardEvent): boolean => (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
  useShortcut((event) => ctrl(event) && event.key.toLowerCase() === 'n', (event) => { event.preventDefault(); void store.newSession(); });
  useShortcut((event) => ctrl(event) && event.key === ',', (event) => { event.preventDefault(); void store.setPage('settings'); });
  useShortcut((event) => ctrl(event) && event.key.toLowerCase() === 'l', (event) => {
    event.preventDefault();
    void store.setPage('chat');
    window.setTimeout(() => document.getElementById('composer-input')?.focus(), 0);
  });

  return (
    <div className="app" data-ready={state.ready}>
      <Sidebar />
      <main className="main">
        <Page />
      </main>
      <Toast />
    </div>
  );
}

export function App(props: { bridge: Bridge | undefined }): React.ReactElement {
  const store = useMemo(() => createStore(props.bridge), [props.bridge]);
  return (
    <StoreContext.Provider value={store}>
      <Shell />
    </StoreContext.Provider>
  );
}
