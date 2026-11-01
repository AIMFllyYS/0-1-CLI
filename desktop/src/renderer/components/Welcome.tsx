import React, { useState } from 'react';
import { useAppState, useStore } from '../hooks';
import { Icon } from './Icon';
import { ProviderForm } from './ProviderForm';

function folderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

function Step(props: { index: number; done: boolean; title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <li className={`step${props.done ? ' is-done' : ''}`}>
      <span className="step-mark" aria-hidden="true">{props.done ? <Icon name="check" size={14} /> : props.index}</span>
      <div className="step-body">
        <h3>{props.title}{props.done && <span className="sr-only">（已完成）</span>}</h3>
        {props.children}
      </div>
    </li>
  );
}

// First-run checklist: pick a folder, configure a model. Each step says what is missing and offers the next action.
export function Welcome(): React.ReactElement {
  const store = useStore();
  const state = useAppState();
  const setup = store.setup();
  const [editingProvider, setEditingProvider] = useState(false);

  return (
    <div className="welcome">
      <header className="welcome-head">
        <h1>从一个项目开始</h1>
        <p>0-1 CLI 是一个在你电脑上运行的编程助手。先完成两件小事，就可以开始对话了。</p>
      </header>

      <ol className="steps">
        <Step index={1} done={!setup.needsWorkspace} title="选择工作目录">
          {setup.needsWorkspace ? (
            <>
              <p>助手只会在这个目录里读写文件，不会碰目录之外的东西。</p>
              <button type="button" className="btn btn-primary" onClick={() => void store.chooseWorkspace()}>
                <Icon name="folder" size={16} />
                选择文件夹…
              </button>
            </>
          ) : (
            <div className="step-done">
              <span className="path-chip"><Icon name="folder" size={14} />{folderName(state.workspace)}</span>
              <span className="path-full" title={state.workspace}>{state.workspace}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void store.chooseWorkspace()}>更换</button>
            </div>
          )}
          {state.recentWorkspaces.length > 1 && (
            <ul className="recent" aria-label="最近使用的目录">
              {state.recentWorkspaces.filter((item) => item !== state.workspace).slice(0, 4).map((item) => (
                <li key={item}><button type="button" className="link" onClick={() => void store.useWorkspace(item)}>{item}</button></li>
              ))}
            </ul>
          )}
        </Step>

        <Step index={2} done={!setup.needsProvider && !editingProvider} title="配置模型">
          {setup.needsProvider || editingProvider ? (
            <>
              <p>填入接口地址和 API Key。没有的话可以先看看「工具 → API 平台」。</p>
              <ProviderForm compact onSaved={() => setEditingProvider(false)} />
            </>
          ) : (
            <div className="step-done">
              <span className="path-chip">{state.provider.activeModelId}</span>
              <span className="path-full">{state.provider.baseUrl}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingProvider(true)}>修改</button>
            </div>
          )}
        </Step>
      </ol>

      <p className="welcome-foot">完成上面两步后会直接进入对话。</p>
    </div>
  );
}
