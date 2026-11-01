import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../hooks';
import { Icon } from './Icon';

type Tab = 'install' | 'skills' | 'clean' | 'guides';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'install', label: '安装工具' },
  { id: 'skills', label: '技能包' },
  { id: 'clean', label: '清理后台进程' },
  { id: 'guides', label: '指南' },
];

const CATEGORY: Record<string, string> = { cli: 'AI 命令行', ide: '编辑器', environment: '环境工具' };

// A button that asks once more before doing something that installs or ends processes.
function ConfirmButton(props: { label: string; confirmLabel: string; busy: boolean; disabled?: boolean; danger?: boolean; onConfirm: () => void }): React.ReactElement {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const timer = window.setTimeout(() => setArmed(false), 6000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  if (props.busy) return <button type="button" className="btn btn-secondary btn-sm" disabled>处理中…</button>;
  if (!armed) {
    return <button type="button" className="btn btn-secondary btn-sm" disabled={props.disabled} onClick={() => setArmed(true)}>{props.label}</button>;
  }
  return (
    <span className="confirm-pair">
      <button type="button" className={`btn btn-sm ${props.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={() => { setArmed(false); props.onConfirm(); }}>{props.confirmLabel}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(false)}>取消</button>
    </span>
  );
}

function Output(props: { text: string; ok: boolean }): React.ReactElement | null {
  if (!props.text) return null;
  return <pre className={`tool-output${props.ok ? '' : ' is-error'}`} role="status">{props.text.trim()}</pre>;
}

function InstallTab(): React.ReactElement {
  const store = useStore();
  const [targets, setTargets] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { void store.callTool('desktop-install:list').then((list) => setTargets(Array.isArray(list) ? list : [])); }, [store]);

  async function install(key: string): Promise<void> {
    setBusy(key);
    const response = await store.callTool('desktop-install:run', { key, latest: false, confirm: true });
    setBusy('');
    setResult({ ok: Boolean(response?.ok), text: response?.output || response?.error || '' });
  }

  if (!targets) return <p className="setting-hint" role="status">正在读取…</p>;
  const groups = ['cli', 'ide', 'environment'].map((category) => ({ category, items: targets.filter((item) => item.category === category) })).filter((group) => group.items.length);

  return (
    <div className="tool-section">
      {groups.map((group) => (
        <section key={group.category}>
          <h3 className="tool-group">{CATEGORY[group.category]}</h3>
          <ul className="card-list">
            {group.items.map((item) => (
              <li key={item.key} className="tool-card">
                <div className="tool-card-main">
                  <p className="launch-name">{item.displayName}</p>
                  <p className="setting-hint">{item.description}</p>
                </div>
                <ConfirmButton label={item.opensUrlOnly ? '打开下载页' : '安装'} confirmLabel={item.opensUrlOnly ? '确认打开' : '确认安装'} busy={busy === item.key} onConfirm={() => void install(item.key)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {result && <Output text={result.text} ok={result.ok} />}
    </div>
  );
}

function SkillsTab(): React.ReactElement {
  const store = useStore();
  const [catalog, setCatalog] = useState<{ packages: any[]; targets: any[] } | null>(null);
  const [skill, setSkill] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void store.callTool('desktop-skills:list').then((data) => {
      const next = data && Array.isArray(data.packages) ? data : { packages: [], targets: [] };
      setCatalog(next);
      setSkill(next.packages[0]?.key || '');
      setChosen(next.targets.filter((target: any) => target.detected).map((target: any) => target.key));
    });
  }, [store]);

  async function install(): Promise<void> {
    setBusy(true);
    const response = await store.callTool('desktop-skills:install', { skillKey: skill, targetKeys: chosen, confirm: true });
    setBusy(false);
    setResult({ ok: Boolean(response?.ok), text: response?.output || response?.error || '' });
  }

  if (!catalog) return <p className="setting-hint" role="status">正在读取…</p>;
  const toggle = (key: string): void => setChosen((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));

  return (
    <div className="tool-section">
      <fieldset className="fieldset">
        <legend>选择技能包</legend>
        {catalog.packages.map((item) => (
          <label key={item.key} className={`choice${skill === item.key ? ' is-active' : ''}`}>
            <input type="radio" name="skill" checked={skill === item.key} onChange={() => setSkill(item.key)} />
            <span><strong>{item.displayName}</strong><em>{item.description}</em></span>
          </label>
        ))}
      </fieldset>
      <fieldset className="fieldset">
        <legend>安装到</legend>
        {catalog.targets.map((target) => (
          <label key={target.key} className="choice">
            <input type="checkbox" checked={chosen.includes(target.key)} onChange={() => toggle(target.key)} />
            <span><strong>{target.displayName}</strong><em>{target.detected ? target.path : `${target.path}（未检测到，将新建）`}</em></span>
          </label>
        ))}
      </fieldset>
      <ConfirmButton label="安装技能包" confirmLabel="确认安装" busy={busy} disabled={!skill || chosen.length === 0} onConfirm={() => void install()} />
      {result && <Output text={result.text} ok={result.ok} />}
    </div>
  );
}

function CleanTab(): React.ReactElement {
  const store = useStore();
  const [scan, setScan] = useState<any | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setScanning(true);
    const response = await store.callTool('desktop-clear:scan');
    setScanning(false);
    setScan(response);
    setSelected([]);
  }, [store]);

  async function end(): Promise<void> {
    setBusy(true);
    const response = await store.callTool('desktop-clear:kill', { pids: selected, confirm: true });
    setBusy(false);
    setResult({ ok: Boolean(response?.ok), text: response?.output || response?.error || '' });
    void refresh();
  }

  const toggle = (pid: number): void => setSelected((current) => (current.includes(pid) ? current.filter((item) => item !== pid) : [...current, pid]));

  return (
    <div className="tool-section">
      <p className="setting-hint">只列出没有可见窗口的后台进程，系统进程和常用软件已排除。先扫描，勾选后再确认结束。</p>
      <div><button type="button" className="btn btn-secondary btn-sm" disabled={scanning} onClick={() => void refresh()}><Icon name="refresh" size={14} />{scanning ? '扫描中…' : scan ? '重新扫描' : '开始扫描'}</button></div>
      {scan && scan.processes.length === 0 && <p className="setting-hint">没有找到可以安全结束的后台进程。</p>}
      {scan && scan.processes.length > 0 && (
        <>
          <ul className="card-list">
            {scan.processes.map((item: any) => (
              <li key={item.pid} className="tool-card">
                <label className="process-row">
                  <input type="checkbox" checked={selected.includes(item.pid)} onChange={() => toggle(item.pid)} />
                  <span>
                    <strong>{item.name}</strong> <em>PID {item.pid} · {Number(item.memoryMB).toFixed(0)} MB</em>
                    <span className="setting-hint">{item.reason}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <ConfirmButton danger label={`结束所选（${selected.length}）`} confirmLabel={`确认结束 ${selected.length} 个进程`} busy={busy} disabled={selected.length === 0} onConfirm={() => void end()} />
        </>
      )}
      {result && <Output text={result.text} ok={result.ok} />}
    </div>
  );
}

function GuidesTab(): React.ReactElement {
  const store = useStore();
  const [output, setOutput] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  async function show(command: string): Promise<void> {
    setBusy(command);
    const response = await store.callTool('cli:run', command);
    setBusy('');
    setOutput({ ok: Boolean(response?.ok), text: response?.output || response?.error || '' });
  }

  const GUIDES = [
    { command: 'hi --api', title: 'API 平台', hint: '常见的模型接口服务和获取 Key 的入口。' },
    { command: 'hi --pay', title: '支付与中转', hint: '支付、虚拟卡和中转资源导航。' },
    { command: 'hi --state', title: '系统状态', hint: 'GitHub、项目路径、命令参考和应用检测。' },
  ];
  return (
    <div className="tool-section">
      <ul className="card-list">
        {GUIDES.map((guide) => (
          <li key={guide.command} className="tool-card">
            <div className="tool-card-main"><p className="launch-name">{guide.title} <code>{guide.command}</code></p><p className="setting-hint">{guide.hint}</p></div>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy === guide.command} onClick={() => void show(guide.command)}>{busy === guide.command ? '读取中…' : '查看'}</button>
          </li>
        ))}
      </ul>
      {output && <Output text={output.text.replace(/\u001b\[[0-9;]*m/g, '')} ok={output.ok} />}
    </div>
  );
}

export function ToolsPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('install');
  return (
    <div className="page">
      <header className="page-head">
        <h1>工具</h1>
        <p>安装常用的 AI 命令行和编辑器、管理技能包、清理后台进程。所有会改动电脑的操作都需要你再确认一次。</p>
      </header>
      <div className="tabs" role="tablist" aria-label="工具分类">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tab${tab === item.id ? ' is-active' : ''}`} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'install' && <InstallTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'clean' && <CleanTab />}
        {tab === 'guides' && <GuidesTab />}
      </div>
    </div>
  );
}
