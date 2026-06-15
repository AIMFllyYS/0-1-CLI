import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { desktopActions, DesktopAction } from './action-catalog';
import './styles.css';

type Mode = 'chat' | 'agent' | 'plan';
type Tab = 'plan' | 'tools' | 'diff' | 'preview' | 'settings';
type InstallCategory = 'cli' | 'ide' | 'environment';
type InstallTarget = {
  key: string;
  displayName: string;
  category: InstallCategory;
  description: string;
  sourceUrl: string;
  opensUrlOnly?: boolean;
};
type SkillPackage = {
  key: string;
  displayName: string;
  description: string;
  sourceUrl: string;
  sourceType: 'local' | 'git';
};
type SkillTarget = {
  key: string;
  displayName: string;
  path: string;
  detected: boolean;
};
type ClearProcess = {
  pid: number;
  name: string;
  memoryMB: number;
  cpuSeconds: number;
  path?: string;
  windowTitle?: string;
  reason: string;
};
type ReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
  size: number;
};
type ReleaseInfo = {
  ok: boolean;
  tagName?: string;
  name?: string;
  htmlUrl?: string;
  publishedAt?: string;
  assets?: ReleaseAsset[];
  error?: string;
};

declare global {
  interface Window {
    zeroOneCli?: {
      runCommand: (command: string) => Promise<{ ok: boolean; output: string }>;
      launchAiSession: (request?: { mode?: 'chat' | 'agent' | 'plan' }) => Promise<{ ok: boolean; output: string }>;
      getLatestRelease: () => Promise<ReleaseInfo>;
      openLatestRelease: () => Promise<{ ok: boolean; url: string; error?: string }>;
      openReleaseAsset: (url: string) => Promise<{ ok: boolean; url: string; error?: string }>;
      listInstallTargets: () => Promise<InstallTarget[]>;
      runInstallTarget: (request: { key: string; latest?: boolean; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
      listSkillPackages: () => Promise<{ packages: SkillPackage[]; targets: SkillTarget[] }>;
      installSkillPackage: (request: { skillKey: string; targetKeys: string[]; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
      scanClearProcesses: () => Promise<{ ok: boolean; processes: ClearProcess[]; total: number; filtered: number; output: string }>;
      killClearProcesses: (request: { pids: number[]; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
    };
  }
}

const sessions = [
  { id: 'local', name: 'My-CLI', status: 'active' },
  { id: 'plan', name: 'Plan Review', status: 'ready' },
  { id: 'release', name: 'Desktop Release', status: 'queued' },
];

const MODE_META: Record<Mode, { title: string; hint: string; prompt: string }> = {
  chat: { title: 'Chat Mode', hint: 'read-only', prompt: '/chat' },
  agent: { title: 'Agent Mode', hint: 'asks before tools', prompt: '/agent' },
  plan: { title: 'Plan Mode', hint: 'no edits', prompt: '/plan' },
};

const transcript = [
  { role: 'system', text: '0-1 CLI Desktop mirrors the AI runtime: chat, agent, plan, settings, models, skills, and local subagents.' },
  { role: 'assistant', text: 'Choose a mode, open the AI terminal bridge, and run dashboard commands from the inspector tools panel.' },
];

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'size unknown';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function App(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('chat');
  const [tab, setTab] = useState<Tab>('tools');
  const [activeAction, setActiveAction] = useState<DesktopAction['id'] | null>(null);
  const [installTargets, setInstallTargets] = useState<InstallTarget[]>([]);
  const [installCategory, setInstallCategory] = useState<InstallCategory>('cli');
  const [selectedInstallKey, setSelectedInstallKey] = useState<string | null>(null);
  const [installLatest, setInstallLatest] = useState(false);
  const [skillPackages, setSkillPackages] = useState<SkillPackage[]>([]);
  const [skillTargets, setSkillTargets] = useState<SkillTarget[]>([]);
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null);
  const [selectedSkillTargets, setSelectedSkillTargets] = useState<string[]>([]);
  const [clearProcesses, setClearProcesses] = useState<ClearProcess[]>([]);
  const [selectedClearPids, setSelectedClearPids] = useState<number[]>([]);
  const [output, setOutput] = useState('Ready.');
  const [copyStatus, setCopyStatus] = useState('');
  const [commandBusy, setCommandBusy] = useState(false);
  const [releaseStatus, setReleaseStatus] = useState('Release status not checked.');
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [aiBridgeBusy, setAiBridgeBusy] = useState(false);
  const modeMeta = MODE_META[mode];
  const modeLabel = useMemo(() => `${modeMeta.title} · ${modeMeta.hint}`, [modeMeta]);

  async function launchAiSession(): Promise<void> {
    if (aiBridgeBusy || commandBusy) {
      setOutput('Another desktop action is still running. Wait for it to finish.');
      return;
    }
    if (!window.zeroOneCli) {
      setOutput('Desktop bridge is unavailable in browser preview.');
      return;
    }
    setAiBridgeBusy(true);
    setCopyStatus('');
    try {
      const result = await window.zeroOneCli.launchAiSession({ mode });
      setOutput(result.output || (result.ok ? 'AI session opened in terminal.' : 'Unable to open AI session.'));
    } finally {
      setAiBridgeBusy(false);
    }
  }

  async function runCommand(command: string): Promise<void> {
    if (commandBusy) {
      setOutput('Another command is still running. Wait for it to finish.');
      return;
    }
    if (!window.zeroOneCli) {
      setOutput('Desktop bridge is unavailable in browser preview.');
      return;
    }
    setCommandBusy(true);
    setCopyStatus('');
    try {
      const result = await window.zeroOneCli.runCommand(command);
      setOutput(result.output || (result.ok ? 'Done.' : 'Command failed.'));
    } finally {
      setCommandBusy(false);
    }
  }

  async function copyOutput(): Promise<void> {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Unable to copy output.');
    }
  }

  async function openAction(action: DesktopAction): Promise<void> {
    if (commandBusy) {
      setOutput('Another command is still running. Wait for it to finish.');
      return;
    }
    setActiveAction(action.id);
    if (action.kind === 'cli-command') {
      await runCommand(action.command);
      return;
    }
    if (!window.zeroOneCli) {
      setOutput('Desktop bridge is unavailable in browser preview.');
      return;
    }
    if (action.kind === 'native-clear') {
      const scan = await window.zeroOneCli.scanClearProcesses();
      setClearProcesses(scan.processes);
      setSelectedClearPids([]);
      setOutput(scan.output || (scan.ok ? 'Process scan completed.' : 'Process scan failed.'));
      return;
    }
    if (action.kind === 'native-skills') {
      const catalog = await window.zeroOneCli.listSkillPackages();
      setSkillPackages(catalog.packages);
      setSkillTargets(catalog.targets);
      setSelectedSkillKey(catalog.packages[0]?.key || null);
      setSelectedSkillTargets(catalog.targets.filter((item) => item.detected).map((item) => item.key).slice(0, 2));
      setOutput('Choose a skill package and targets, then confirm installation.');
      return;
    }
    const targets = await window.zeroOneCli.listInstallTargets();
    setInstallTargets(targets);
    setSelectedInstallKey(targets.find((item) => item.category === installCategory)?.key || null);
    setOutput('Choose an install target, then confirm from the desktop panel.');
  }

  async function refreshClearProcesses(): Promise<void> {
    if (!window.zeroOneCli) {
      setOutput('Desktop bridge is unavailable in browser preview.');
      return;
    }
    const scan = await window.zeroOneCli.scanClearProcesses();
    setClearProcesses(scan.processes);
    setSelectedClearPids((current) => current.filter((pid) => scan.processes.some((item) => item.pid === pid)));
    setOutput(scan.output || (scan.ok ? 'Process scan completed.' : 'Process scan failed.'));
  }

  async function runSelectedClearKill(): Promise<void> {
    if (!window.zeroOneCli) {
      setOutput('Desktop bridge is unavailable in browser preview.');
      return;
    }
    if (selectedClearPids.length === 0) {
      setOutput('Select at least one process first.');
      return;
    }
    const result = await window.zeroOneCli.killClearProcesses({
      pids: selectedClearPids,
      confirm: true,
    });
    setOutput(result.output || (result.ok ? 'Selected processes ended.' : 'Clear action failed.'));
    await refreshClearProcesses();
  }

  async function runSelectedInstall(): Promise<void> {
    if (!window.zeroOneCli || !selectedInstallKey) {
      setOutput('Select an install target first.');
      return;
    }
    const result = await window.zeroOneCli.runInstallTarget({
      key: selectedInstallKey,
      latest: installLatest,
      confirm: true,
    });
    setOutput(result.output || (result.ok ? 'Install action started.' : 'Install action failed.'));
  }

  async function runSelectedSkillInstall(): Promise<void> {
    if (!window.zeroOneCli || !selectedSkillKey) {
      setOutput('Select a skill package first.');
      return;
    }
    const result = await window.zeroOneCli.installSkillPackage({
      skillKey: selectedSkillKey,
      targetKeys: selectedSkillTargets,
      confirm: true,
    });
    setOutput(result.output || (result.ok ? 'Skill install completed.' : 'Skill install failed.'));
  }

  async function checkLatestRelease(): Promise<void> {
    if (!window.zeroOneCli) {
      setReleaseStatus('Desktop bridge is unavailable in browser preview.');
      return;
    }
    const release = await window.zeroOneCli.getLatestRelease();
    setReleaseInfo(release);
    if (!release.ok) {
      setReleaseStatus(release.error || 'Unable to read latest release.');
      return;
    }
    const assetText = release.assets?.length ? `${release.assets.length} assets` : 'no assets';
    setReleaseStatus(`${release.tagName || release.name || 'Latest release'} - ${assetText}`);
  }

  async function openLatestRelease(): Promise<void> {
    if (!window.zeroOneCli) {
      setReleaseStatus('Desktop bridge is unavailable in browser preview.');
      return;
    }
    const result = await window.zeroOneCli.openLatestRelease();
    setReleaseStatus(result.ok ? `Opened ${result.url}` : (result.error || 'Unable to open release page.'));
  }

  async function openReleaseAsset(asset: ReleaseAsset): Promise<void> {
    if (!window.zeroOneCli) {
      setReleaseStatus('Desktop bridge is unavailable in browser preview.');
      return;
    }
    const result = await window.zeroOneCli.openReleaseAsset(asset.browserDownloadUrl);
    setReleaseStatus(result.ok ? `Opened ${asset.name}` : (result.error || 'Unable to open release asset.'));
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">01</span>
          <div>
            <strong>0-1 CLI</strong>
            <small>Desktop</small>
          </div>
        </div>
        <section className="sessionList">
          {sessions.map((session) => (
            <button className="session" key={session.id} type="button">
              <span>{session.name}</span>
              <em>{session.status}</em>
            </button>
          ))}
        </section>
        <footer className="railFooter">
          <p>Workspace shell</p>
          <span>Dashboard commands stay in the inspector. AI runs in a separate terminal bridge.</span>
        </footer>
      </aside>

      <section className="conversation">
        <header className="topbar">
          <div>
            <p>Workspace</p>
            <h1>My-CLI AI Runtime</h1>
          </div>
          <div className="modeSwitchWrap">
            <div className="modeSwitch" aria-label="Mode">
              {(['chat', 'agent', 'plan'] as Mode[]).map((item) => (
                <button key={item} type="button" className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>
                  {item}
                </button>
              ))}
            </div>
            <p className="modeHint">{MODE_META[mode].hint}</p>
          </div>
        </header>

        <div className="conversationStatus">
          <span className="modeBadge">{modeMeta.prompt}</span>
          <span>{modeLabel}</span>
        </div>

        <div className="thread">
          {transcript.map((item, index) => (
            <article className={`bubble ${item.role}`} key={index}>
              <span>{item.role}</span>
              <p>{item.text}</p>
            </article>
          ))}
          <article className="bubble assistant highlight">
            <span>status</span>
            <p>{modeLabel}. Use the composer to open an isolated AI terminal session, or run whitelisted dashboard commands from Tools.</p>
          </article>
        </div>

        <footer className="composer">
          <div className="composerField">
            <span className="composerPrefix">{modeMeta.prompt}</span>
            <input value="Open the terminal bridge to chat with My-CLI AI" readOnly aria-label="Prompt" />
          </div>
          <button type="button" disabled={aiBridgeBusy || commandBusy} onClick={() => void launchAiSession()}>
            {aiBridgeBusy ? 'Opening…' : 'Open AI terminal'}
          </button>
          <p className="composerHint">Interactive AI stays outside dashboard IPC. Configure models with /setting inside the terminal session.</p>
        </footer>
      </section>

      <aside className="inspector">
        <nav className="tabs">
          {(['plan', 'tools', 'diff', 'preview', 'settings'] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? 'selected' : ''} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </nav>

        <section className="panel">
          {tab === 'tools' && activeAction !== 'install' && activeAction !== 'skills' && activeAction !== 'clear' && (
            <div className="commandGrid">
              {desktopActions.map((card) => (
                <button
                  className="commandCard"
                  key={card.id}
                  disabled={commandBusy}
                  onClick={() => void openAction(card)}
                >
                  <strong>{card.title}</strong>
                  <code>{card.command}</code>
                  <span>{card.description}</span>
                </button>
              ))}
            </div>
          )}
          {tab === 'tools' && activeAction === 'install' && (
            <InstallPanel
              category={installCategory}
              targets={installTargets}
              selectedKey={selectedInstallKey}
              latest={installLatest}
              onBack={() => setActiveAction(null)}
              onCategory={(category) => {
                setInstallCategory(category);
                setSelectedInstallKey(installTargets.find((item) => item.category === category)?.key || null);
              }}
              onSelect={setSelectedInstallKey}
              onLatest={setInstallLatest}
              onInstall={runSelectedInstall}
            />
          )}
          {tab === 'tools' && activeAction === 'skills' && (
            <SkillsPanel
              packages={skillPackages}
              targets={skillTargets}
              selectedSkillKey={selectedSkillKey}
              selectedTargetKeys={selectedSkillTargets}
              onBack={() => setActiveAction(null)}
              onSelectSkill={setSelectedSkillKey}
              onToggleTarget={(key) => {
                setSelectedSkillTargets((current) => current.includes(key)
                  ? current.filter((item) => item !== key)
                  : [...current, key]);
              }}
              onInstall={runSelectedSkillInstall}
            />
          )}
          {tab === 'tools' && activeAction === 'clear' && (
            <ClearPanel
              processes={clearProcesses}
              selectedPids={selectedClearPids}
              onBack={() => setActiveAction(null)}
              onRefresh={refreshClearProcesses}
              onToggle={(pid) => {
                setSelectedClearPids((current) => current.includes(pid)
                  ? current.filter((item) => item !== pid)
                  : [...current, pid]);
              }}
              onKill={runSelectedClearKill}
            />
          )}
          {tab === 'plan' && <p>Plan mode is read-only. Use the CLI conversation to draft and review task plans.</p>}
          {tab === 'diff' && <p>Diff review is prepared for file-change summaries from future agent runs.</p>}
          {tab === 'preview' && <p>Preview panes can host local app/browser output in a later integration.</p>}
          {tab === 'settings' && (
            <SettingsPanel
              releaseStatus={releaseStatus}
              releaseInfo={releaseInfo}
              aiBridgeBusy={aiBridgeBusy}
              commandBusy={commandBusy}
              mode={mode}
              onLaunchAi={() => void launchAiSession()}
              onCheckRelease={() => void checkLatestRelease()}
              onOpenRelease={() => void openLatestRelease()}
              onOpenAsset={(asset) => void openReleaseAsset(asset)}
            />
          )}
        </section>

        <div className="outputPanel">
          <div className="outputHeader">
            <span>{commandBusy ? 'Running dashboard command…' : 'Dashboard output'}</span>
            <div className="outputActions">
              {copyStatus && <em className="copyStatus">{copyStatus}</em>}
              <button type="button" disabled={!output || commandBusy} onClick={() => void copyOutput()}>
                Copy output
              </button>
            </div>
          </div>
          <pre className="output" tabIndex={0}>{output}</pre>
        </div>
      </aside>
    </main>
  );
}

function ClearPanel(props: {
  processes: ClearProcess[];
  selectedPids: number[];
  onBack: () => void;
  onRefresh: () => void;
  onToggle: (pid: number) => void;
  onKill: () => void;
}): React.ReactElement {
  return (
    <div className="clearPanel">
      <div className="panelHeader">
        <div>
          <p>native desktop action</p>
          <h2>Clean workstation</h2>
        </div>
        <div className="headerActions">
          <button onClick={() => void props.onRefresh()}>Scan</button>
          <button onClick={props.onBack}>Back</button>
        </div>
      </div>
      <div className="clearProcesses">
        {props.processes.length === 0 && (
          <p className="emptyState">No safe background process candidates found.</p>
        )}
        {props.processes.map((item) => (
          <label key={item.pid} className={props.selectedPids.includes(item.pid) ? 'clearProcess selectedTarget' : 'clearProcess'}>
            <input type="checkbox" checked={props.selectedPids.includes(item.pid)} onChange={() => props.onToggle(item.pid)} />
            <span>
              <strong>{item.name}</strong>
              <em>PID {item.pid} / {item.memoryMB.toFixed(1)} MB / CPU {item.cpuSeconds.toFixed(1)}s</em>
              <small>{item.reason}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="confirmStrip">
        <span>{props.selectedPids.length} processes selected. Confirmation is required before taskkill runs.</span>
        <button disabled={props.selectedPids.length === 0} onClick={() => void props.onKill()}>
          Confirm end selected
        </button>
      </div>
    </div>
  );
}

function SkillsPanel(props: {
  packages: SkillPackage[];
  targets: SkillTarget[];
  selectedSkillKey: string | null;
  selectedTargetKeys: string[];
  onBack: () => void;
  onSelectSkill: (key: string) => void;
  onToggleTarget: (key: string) => void;
  onInstall: () => void;
}): React.ReactElement {
  const selected = props.packages.find((item) => item.key === props.selectedSkillKey) || props.packages[0];

  return (
    <div className="skillsPanel">
      <div className="panelHeader">
        <div>
          <p>native desktop action</p>
          <h2>Skills market</h2>
        </div>
        <button onClick={props.onBack}>Back</button>
      </div>
      <div className="skillPackages">
        {props.packages.map((skill) => (
          <button key={skill.key} className={props.selectedSkillKey === skill.key ? 'skillPackage selectedTarget' : 'skillPackage'} onClick={() => props.onSelectSkill(skill.key)}>
            <strong>{skill.displayName}</strong>
            <span>{skill.description}</span>
            <code>{skill.sourceType}</code>
          </button>
        ))}
      </div>
      <div className="targetChecklist">
        {props.targets.map((target) => (
          <label key={target.key} className="checkRow">
            <input type="checkbox" checked={props.selectedTargetKeys.includes(target.key)} onChange={() => props.onToggleTarget(target.key)} />
            <span>{target.displayName} {target.detected ? '' : '(not detected)'} · {target.path}</span>
          </label>
        ))}
      </div>
      <div className="confirmStrip">
        <span>{selected ? selected.sourceUrl : 'No skill package selected.'}</span>
        <button disabled={!selected || props.selectedTargetKeys.length === 0} onClick={() => void props.onInstall()}>
          Confirm install
        </button>
      </div>
    </div>
  );
}

function SettingsPanel(props: {
  releaseStatus: string;
  releaseInfo: ReleaseInfo | null;
  aiBridgeBusy: boolean;
  commandBusy: boolean;
  mode: Mode;
  onLaunchAi: () => void;
  onCheckRelease: () => void;
  onOpenRelease: () => void;
  onOpenAsset: (asset: ReleaseAsset) => void;
}): React.ReactElement {
  return (
    <div className="settingsPanel">
      <div className="panelHeader">
        <div>
          <p>provider settings</p>
          <h2>CLI configuration</h2>
        </div>
      </div>
      <div className="settingsCopy">
        <p>Use <code>/setting</code> inside the AI terminal to persist base URL, API key, model IDs, and the active model.</p>
        <p>Desktop does not collect secrets over IPC. Open the terminal bridge, run <code>/setting</code>, and follow the masked prompts there.</p>
      </div>
      <div className="settingsActions">
        <button type="button" disabled={props.aiBridgeBusy || props.commandBusy} onClick={props.onLaunchAi}>
          Open AI terminal
        </button>
        <span>Selected mode: {props.mode} · {MODE_META[props.mode].hint}</span>
      </div>
      <div className="settingsSection">
        <h3>Release assets</h3>
        <button type="button" onClick={props.onCheckRelease}>Check latest release</button>
        <button type="button" onClick={props.onOpenRelease}>Open release page</button>
        <span className="releaseStatus">{props.releaseStatus}</span>
        {props.releaseInfo?.ok && (
          <div className="releaseAssets">
            <div className="releaseMeta">
              <strong>{props.releaseInfo.tagName || props.releaseInfo.name || 'Latest release'}</strong>
              <span>{props.releaseInfo.publishedAt || 'Published time unavailable'}</span>
            </div>
            {(props.releaseInfo.assets || []).length === 0 && (
              <p className="emptyState">No downloadable desktop assets on this release.</p>
            )}
            {(props.releaseInfo.assets || []).map((asset) => (
              <div className="releaseAsset" key={asset.browserDownloadUrl || asset.name}>
                <span>
                  <strong>{asset.name}</strong>
                  <em>{formatBytes(asset.size)}</em>
                </span>
                <button type="button" onClick={() => props.onOpenAsset(asset)}>Download asset</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InstallPanel(props: {
  category: InstallCategory;
  targets: InstallTarget[];
  selectedKey: string | null;
  latest: boolean;
  onBack: () => void;
  onCategory: (category: InstallCategory) => void;
  onSelect: (key: string) => void;
  onLatest: (latest: boolean) => void;
  onInstall: () => void;
}): React.ReactElement {
  const visibleTargets = props.targets.filter((item) => item.category === props.category);
  const selected = visibleTargets.find((item) => item.key === props.selectedKey) || visibleTargets[0];

  return (
    <div className="installPanel">
      <div className="panelHeader">
        <div>
          <p>native desktop action</p>
          <h2>Install tools</h2>
        </div>
        <button onClick={props.onBack}>Back</button>
      </div>
      <div className="categorySwitch" aria-label="Install category">
        {(['cli', 'ide', 'environment'] as InstallCategory[]).map((category) => (
          <button key={category} className={props.category === category ? 'selected' : ''} onClick={() => props.onCategory(category)}>
            {category}
          </button>
        ))}
      </div>
      <div className="installTargets">
        {visibleTargets.map((target) => (
          <button key={target.key} className={props.selectedKey === target.key ? 'installTarget selectedTarget' : 'installTarget'} onClick={() => props.onSelect(target.key)}>
            <strong>{target.displayName}</strong>
            <span>{target.description}</span>
          </button>
        ))}
      </div>
      <label className="checkRow">
        <input type="checkbox" checked={props.latest} onChange={(event) => props.onLatest(event.currentTarget.checked)} />
        <span>Use latest/update path when the target supports it</span>
      </label>
      <div className="confirmStrip">
        <span>{selected ? selected.sourceUrl : 'No targets in this category.'}</span>
        <button disabled={!selected} onClick={() => void props.onInstall()}>
          Confirm install
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
