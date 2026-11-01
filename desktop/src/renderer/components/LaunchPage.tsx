import React, { useEffect, useState } from 'react';
import { useAppState, useStore } from '../hooks';
import { Icon } from './Icon';

export function LaunchPage(): React.ReactElement {
  const store = useStore();
  const { launch } = useAppState();
  const [running, setRunning] = useState('');

  useEffect(() => { void store.loadLaunch(); }, [store]);

  async function run(id: string): Promise<void> {
    setRunning(id);
    await store.runLaunch(id);
    setRunning('');
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>启动台</h1>
        <p>注册常用的项目目录和启动命令，一键在新终端里拉起。在命令行里用 <code>hi path add</code> 添加，用 <code>hi run &lt;id&gt;</code> 启动。</p>
      </header>

      {launch.status === 'error' && (
        <p className="form-error" role="alert">{launch.error}</p>
      )}

      {launch.status === 'loading' && launch.entries.length === 0 && <p className="setting-hint" role="status">正在读取…</p>}

      {launch.status !== 'loading' && launch.entries.length === 0 && launch.status !== 'error' && (
        <div className="blank">
          <Icon name="rocket" size={28} />
          <h2>还没有注册任何项目</h2>
          <p>在终端里运行下面的命令，就能把一个目录加到这里：</p>
          <pre className="cmd">hi path add D:\\projects\\my-app --start "npm run dev"</pre>
        </div>
      )}

      {launch.entries.length > 0 && (
        <ul className="card-list">
          {launch.entries.map((entry) => (
            <li key={entry.id} className="launch-card">
              <div className="launch-main">
                <p className="launch-name">{entry.name} <code>{entry.id}</code></p>
                <p className="launch-path" title={entry.path}>{entry.path}</p>
                <p className="launch-cmd">
                  <Icon name="terminal" size={13} />
                  {entry.start ? <code>{entry.start}</code> : <span>只打开终端，不运行命令</span>}
                  {entry.kind === 'script' && <span className="tag">脚本</span>}
                </p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" disabled={running === entry.id} onClick={() => void run(entry.id)}>
                <Icon name="play" size={13} />
                {running === entry.id ? '启动中…' : '启动'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
