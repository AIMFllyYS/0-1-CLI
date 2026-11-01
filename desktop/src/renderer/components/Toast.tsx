import React, { useEffect } from 'react';
import { useAppState, useStore } from '../hooks';
import { Icon } from './Icon';

const LIFETIME: Record<string, number> = { info: 4000, success: 3000, warn: 9000, error: 9000 };

export function Toast(): React.ReactElement | null {
  const store = useStore();
  const { toast } = useAppState();

  useEffect(() => {
    if (!toast) return undefined;
    const id = toast.id;
    const timer = window.setTimeout(() => store.dismissToast(id), LIFETIME[toast.tone] ?? 5000);
    return () => window.clearTimeout(timer);
  }, [toast, store]);

  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <Icon name={toast.tone === 'error' || toast.tone === 'warn' ? 'alert' : toast.tone === 'success' ? 'check' : 'info'} />
      <span>{toast.text}</span>
      <button type="button" aria-label="关闭提示" onClick={() => store.dismissToast(toast.id)}><Icon name="x" size={14} /></button>
    </div>
  );
}
