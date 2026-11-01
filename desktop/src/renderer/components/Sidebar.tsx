import React from 'react';
import { useAppState, useStore } from '../hooks';
import type { Page, Session } from '../state/store';
import { pendingApproval } from '../state/transcript';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const NAV: Array<{ page: Page; label: string; icon: IconName }> = [
  { page: 'launch', label: '启动台', icon: 'rocket' },
  { page: 'tools', label: '工具', icon: 'wrench' },
  { page: 'settings', label: '设置', icon: 'gear' },
];

function folderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

function SessionRow(props: { session: Session; active: boolean }): React.ReactElement {
  const store = useStore();
  const { session, active } = props;
  const waiting = pendingApproval(session) !== undefined;

  let badge: React.ReactNode = null;
  if (waiting) badge = <span className="badge badge-warn" title="等待你批准">待批准</span>;
  else if (session.running) badge = <span className="pulse" role="status" aria-label="运行中" />;
  else if (session.attention === 'done') badge = <span className="dot" role="status" aria-label="有新结果" />;

  return (
    <li className="session-row-wrap">
      <button
        type="button"
        className={`session-row${active ? ' is-active' : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => store.selectSession(session.id)}
      >
        <span className="session-title">{session.title || '新对话'}</span>
        <span className="session-sub">
          <Icon name="folder" size={12} />
          <span className="session-folder">{folderName(session.workspace)}</span>
          {badge}
        </span>
      </button>
      <button
        type="button"
        className="session-close"
        aria-label={`关闭对话：${session.title || '新对话'}`}
        onClick={() => void store.closeSession(session.id)}
      >
        <Icon name="x" size={14} />
      </button>
    </li>
  );
}

export function Sidebar(): React.ReactElement {
  const store = useStore();
  const state = useAppState();

  return (
    <aside className="sidebar" aria-label="导航">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">01</span>
        <span className="brand-name">0-1 CLI</span>
      </div>

      <button type="button" className="btn btn-primary new-chat" onClick={() => void store.newSession()}>
        <Icon name="plus" size={16} />
        新对话
        <kbd>Ctrl N</kbd>
      </button>

      <nav className="session-nav" aria-label="对话列表">
        {state.sessions.length === 0 ? (
          <p className="session-empty">还没有对话。点「新对话」开始，或直接在右侧输入。</p>
        ) : (
          <ul className="session-list">
            {[...state.sessions].reverse().map((session) => (
              <SessionRow key={session.id} session={session} active={state.page === 'chat' && session.id === state.activeId} />
            ))}
          </ul>
        )}
      </nav>

      <nav className="sidebar-foot" aria-label="功能">
        {NAV.map((item) => (
          <button
            key={item.page}
            type="button"
            className={`nav-item${state.page === item.page ? ' is-active' : ''}`}
            aria-current={state.page === item.page ? 'page' : undefined}
            onClick={() => void store.setPage(item.page)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
        <p className="version">v{state.version}</p>
      </nav>
    </aside>
  );
}
