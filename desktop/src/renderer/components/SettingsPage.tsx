import React, { useEffect, useState } from 'react';
import { useAppState, useStore } from '../hooks';
import type { ThemeChoice } from '../state/store';
import { Icon } from './Icon';
import { ProviderForm } from './ProviderForm';

function Switch(props: { id: string; checked: boolean; onChange: (value: boolean) => void; labelledBy: string }): React.ReactElement {
  return (
    <button
      id={props.id}
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-labelledby={props.labelledBy}
      className={`switch${props.checked ? ' is-on' : ''}`}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

function Row(props: { id: string; title: string; hint: string; children: React.ReactNode; danger?: boolean }): React.ReactElement {
  return (
    <div className={`setting-row${props.danger ? ' is-danger' : ''}`}>
      <div className="setting-text">
        <p id={`${props.id}-label`} className="setting-title">{props.title}</p>
        <p className="setting-hint">{props.hint}</p>
      </div>
      <div className="setting-control">{props.children}</div>
    </div>
  );
}

function Group(props: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="setting-group">
      <h2>{props.title}</h2>
      <div className="setting-card">{props.children}</div>
    </section>
  );
}

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export function SettingsPage(): React.ReactElement {
  const store = useStore();
  const state = useAppState();
  const { settings, provider, platform, version } = state;
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [rounds, setRounds] = useState(String(settings.ai.maxToolRounds));
  const [model, setModel] = useState(settings.ai.defaultModelId);
  const [editProvider, setEditProvider] = useState(!provider.configured);

  useEffect(() => { setRounds(String(settings.ai.maxToolRounds)); }, [settings.ai.maxToolRounds]);
  useEffect(() => { setModel(settings.ai.defaultModelId); }, [settings.ai.defaultModelId]);
  useEffect(() => {
    if (settings.github.prefetch && state.github.status === 'idle') void store.loadGithub();
  }, [settings.github.prefetch, state.github.status, store]);

  const windows = platform === 'win32';

  return (
    <div className="page">
      <header className="page-head">
        <h1>设置</h1>
        <p>改动会立刻生效，也同样适用于命令行里的 <code>hi</code>。</p>
      </header>

      <Group title="模型">
        <div className="setting-block">
          {provider.configured && !editProvider ? (
            <div className="provider-summary">
              <div>
                <p className="setting-title">{provider.activeModelId}</p>
                <p className="setting-hint">{provider.baseUrl} · Key {provider.apiKeyMasked}</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditProvider(true)}>修改</button>
            </div>
          ) : (
            <ProviderForm onSaved={() => setEditProvider(false)} />
          )}
        </div>
      </Group>

      <Group title="助手默认值">
        <Row id="mode" title="新对话的默认模式" hint="打开新对话时从哪种模式开始。">
          <select aria-labelledby="mode-label" value={settings.ai.defaultMode} onChange={(event) => void store.setSetting('ai.defaultMode', event.target.value)}>
            <option value="chat">只读</option>
            <option value="agent">执行（逐项确认）</option>
            <option value="plan">计划</option>
          </select>
        </Row>
        <Row id="model" title="默认模型" hint="留空则使用上面当前选中的模型。">
          <input
            aria-labelledby="model-label"
            type="text"
            value={model}
            placeholder="沿用当前模型"
            spellCheck={false}
            onChange={(event) => setModel(event.target.value)}
            onBlur={() => { if (model !== settings.ai.defaultModelId) void store.setSetting('ai.defaultModelId', model); }}
          />
        </Row>
        <Row id="rounds" title="单次最多调用工具的轮数" hint="防止助手在一个任务里无限循环，范围 1 到 50。">
          <input
            aria-labelledby="rounds-label"
            type="number"
            min={1}
            max={50}
            value={rounds}
            onChange={(event) => setRounds(event.target.value)}
            onBlur={() => { if (rounds !== String(settings.ai.maxToolRounds)) void store.setSetting('ai.maxToolRounds', Number(rounds)); }}
          />
        </Row>
        <Row id="auto" title="自动接受工具权限" hint="开启后，在工作目录内改文件、跑命令不再逐项询问。目录之外的操作和高危命令仍会被拦截。" danger>
          {confirmAuto ? (
            <div className="confirm-inline" role="alertdialog" aria-label="确认开启自动接受">
              <p>助手将可以不经你确认地修改这个目录里的文件。确定开启？</p>
              <div className="approval-actions">
                <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmAuto(false); void store.setSetting('ai.autoAccept', true); }}>确定开启</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmAuto(false)}>取消</button>
              </div>
            </div>
          ) : (
            <Switch id="auto" labelledBy="auto-label" checked={settings.ai.autoAccept} onChange={(value) => (value ? setConfirmAuto(true) : void store.setSetting('ai.autoAccept', false))} />
          )}
        </Row>
      </Group>

      <Group title="启动">
        <Row id="desktop-start" title="登录系统后自动打开桌面应用" hint="只在安装版中可用；开发版会提示原因。">
          <Switch id="desktop-start" labelledBy="desktop-start-label" checked={settings.startup.desktopAutostart} onChange={(value) => void store.setSetting('startup.desktopAutostart', value)} />
        </Row>
        <Row id="cli-start" title="开机时在终端里打开 hi" hint={windows ? '会在系统启动文件夹里放一个脚本，随时可以在这里关掉。' : '目前只支持 Windows。'}>
          <Switch id="cli-start" labelledBy="cli-start-label" checked={settings.startup.cliAutostart} onChange={(value) => void store.setSetting('startup.cliAutostart', value)} />
        </Row>
      </Group>

      <Group title="GitHub">
        <Row id="prefetch" title="启动时先读取 GitHub 信息" hint="读取账号和最近的 Issues，只读、不上传任何本地信息。关闭后按需读取。">
          <Switch id="prefetch" labelledBy="prefetch-label" checked={settings.github.prefetch} onChange={(value) => void store.setSetting('github.prefetch', value)} />
        </Row>
        <div className="setting-block github-block">
          <GithubSummary />
        </div>
      </Group>

      <Group title="外观">
        <Row id="theme" title="主题" hint="跟随系统会随系统的深浅色自动切换。">
          <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
            {THEMES.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={settings.appearance.theme === item.value}
                className={`segment${settings.appearance.theme === item.value ? ' is-active' : ''}`}
                onClick={() => void store.setSetting('appearance.theme', item.value)}
              >
                <Icon name={item.value === 'dark' ? 'moon' : item.value === 'light' ? 'sun' : 'sparkle'} size={14} />
                {item.label}
              </button>
            ))}
          </div>
        </Row>
      </Group>

      <p className="page-foot">0-1 CLI v{version} · 设置保存在你的用户目录，不会上传。</p>
    </div>
  );
}

export function GithubSummary(): React.ReactElement {
  const store = useStore();
  const { github, settings } = useAppState();

  if (github.status === 'disabled' || (!settings.github.prefetch && github.status === 'idle')) {
    return (
      <div className="github-state">
        <p className="setting-hint">已关闭启动时预读。需要时可以手动读取一次。</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void store.loadGithub({ force: true })}>
          <Icon name="refresh" size={14} />现在读取
        </button>
      </div>
    );
  }
  if (github.status === 'loading' && !github.data) return <p className="setting-hint" role="status">正在读取 GitHub…</p>;
  if (github.status === 'error' && !github.data) {
    return (
      <div className="github-state">
        <p className="form-error" role="alert">{github.error}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void store.loadGithub({ force: true })}>重试</button>
      </div>
    );
  }
  const data = github.data;
  if (!data) return <p className="setting-hint">还没有读取。</p>;
  if (data.available === false) {
    return <p className="setting-hint"><Icon name="info" size={14} /> {data.reason || '无法使用 GitHub CLI'}</p>;
  }
  return (
    <div className="github-state">
      <div className="github-line">
        <Icon name="github" size={16} />
        {data.activeUsername
          ? <span>已登录 <strong>{data.activeUsername}</strong>{data.accounts.length > 1 && ` · 共 ${data.accounts.length} 个账号`}</span>
          : <span>{data.reason || '尚未登录 GitHub'}</span>}
        <button type="button" className="btn btn-ghost btn-sm github-refresh" onClick={() => void store.loadGithub({ force: true })} aria-label="刷新 GitHub 信息">
          <Icon name="refresh" size={14} />
        </button>
      </div>
      {data.issuesError && <p className="setting-hint">Issues 读取失败：{data.issuesError}</p>}
      {data.issues.length > 0 && (
        <ul className="issue-list" aria-label="最近的 Issues">
          {data.issues.slice(0, 5).map((issue: any) => (
            <li key={`${issue.repo}#${issue.number}`}>
              <a href={issue.url} target="_blank" rel="noreferrer noopener">{issue.title}</a>
              <span>{issue.repo}#{issue.number}</span>
            </li>
          ))}
        </ul>
      )}
      {!data.issuesError && data.issues.length === 0 && <p className="setting-hint">最近 7 天没有新的 Issues。</p>}
    </div>
  );
}
