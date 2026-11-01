import React, { useEffect, useRef, useState } from 'react';
import { useAppState, useStore } from '../hooks';
import type { Item } from '../state/transcript';
import { ApprovalCard } from './ApprovalCard';
import { Composer } from './Composer';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { ToolRow } from './ToolRow';
import { Welcome } from './Welcome';

const STARTERS = [
  { title: '了解这个项目', prompt: '先看看这个项目的目录结构和 README，用几句话告诉我它是做什么的。' },
  { title: '找出潜在问题', prompt: '检查最近改动的代码，指出可能的 bug 和需要补测试的地方。' },
  { title: '解释一段代码', prompt: '帮我解释 src 目录里最核心的模块是怎么工作的。' },
  { title: '规划一个改动', prompt: '我想增加一个新功能，先帮我出一份分步骤的计划，不要直接改代码。' },
];

function modeLabel(mode: string, permissionMode: string): string {
  if (mode === 'chat') return '只读';
  if (mode === 'plan') return '计划';
  return permissionMode === 'bypass' ? '执行 · 自动接受' : '执行 · 逐项确认';
}

function Reasoning(props: { text: string; streaming: boolean }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="reasoning">
      <button type="button" className="reasoning-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Icon name="brain" size={14} />
        {props.streaming ? '正在思考…' : '思考过程'}
        <Icon name={open ? 'chevronDown' : 'chevron'} size={12} />
      </button>
      {open && <p className="reasoning-text">{props.text}</p>}
    </div>
  );
}

function Row(props: { item: Item }): React.ReactElement | null {
  const { item } = props;
  switch (item.kind) {
    case 'user':
      return <div className="msg msg-user"><p>{item.text}</p></div>;
    case 'assistant':
      return (
        <div className="msg msg-assistant">
          {item.reasoning && <Reasoning text={item.reasoning} streaming={item.streaming && !item.text} />}
          {item.text && <Markdown text={item.text} />}
          {item.streaming && item.text && <span className="caret" aria-hidden="true" />}
        </div>
      );
    case 'tool':
      return <ToolRow item={item} />;
    case 'approval':
      return <ApprovalCard item={item} />;
    case 'notice':
      return (
        <p className={`notice notice-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
          <Icon name={item.tone === 'info' ? 'info' : 'alert'} size={15} />
          {item.text}
        </p>
      );
    default:
      return null;
  }
}

function Empty(props: { onPick: (prompt: string) => void }): React.ReactElement {
  return (
    <div className="empty">
      <h1>今天想做点什么？</h1>
      <p>描述任务，或者从下面挑一个开始。</p>
      <ul className="starters">
        {STARTERS.map((starter) => (
          <li key={starter.title}>
            <button type="button" className="starter" onClick={() => props.onPick(starter.prompt)}>
              <strong>{starter.title}</strong>
              <span>{starter.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChatPage(): React.ReactElement {
  const store = useStore();
  const state = useAppState();
  const session = store.activeSession();
  const log = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [focusSignal, setFocusSignal] = useState(0);
  const [showJump, setShowJump] = useState(false);

  const setup = store.setup();

  // Follow the stream while the reader is at the bottom; stop following as soon as they scroll up.
  useEffect(() => {
    const element = log.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [session?.items]);

  function onScroll(): void {
    const element = log.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    stick.current = atBottom;
    setShowJump(!atBottom);
  }

  function jump(): void {
    const element = log.current;
    if (!element) return;
    stick.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }

  if (!setup.complete) return <Welcome />;

  async function pick(prompt: string): Promise<void> {
    await store.send(prompt);
    setFocusSignal((value) => value + 1);
  }

  return (
    <div className="chat">
      <header className="chat-head">
        <button type="button" className="ctx" title={`${session?.workspace || state.workspace}\n点击更换工作目录`} onClick={() => void store.chooseWorkspace()}>
          <Icon name="folder" size={15} />
          <span>{(session?.workspace || state.workspace).replace(/\\/g, '/').split('/').filter(Boolean).pop()}</span>
        </button>
        {session && (
          <span className={`ctx-mode mode-${session.mode}${session.permissionMode === 'bypass' ? ' is-auto' : ''}`}>
            {modeLabel(session.mode, session.permissionMode)}
          </span>
        )}
        <span className="chat-model" title={state.provider.baseUrl}>{state.provider.activeModelId}</span>
      </header>

      <div className="log-wrap">
        <div ref={log} className="log" role="log" aria-live="polite" aria-label="对话" onScroll={onScroll}>
          <div className="log-inner">
            {!session || session.items.length === 0
              ? <Empty onPick={(prompt) => void pick(prompt)} />
              : session.items.map((item) => <Row key={item.id} item={item} />)}
          </div>
        </div>
        {showJump && (
          <button type="button" className="jump" onClick={jump} aria-label="回到最新">
            <Icon name="chevronDown" size={16} />
          </button>
        )}
      </div>

      <Composer session={session} focusSignal={focusSignal} />
    </div>
  );
}
