import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { AppState, Store } from './state/store';

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext is missing');
  return store;
}

// Re-renders when the store changes; getState returns a stable reference between changes.
export function useAppState(): AppState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useSystemDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export function useShortcut(match: (event: KeyboardEvent) => boolean, run: (event: KeyboardEvent) => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.isComposing || !match(event)) return;
      run(event);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
}
