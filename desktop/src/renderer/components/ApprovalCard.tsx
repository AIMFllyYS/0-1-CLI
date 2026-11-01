import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks';
import type { Item } from '../state/transcript';
import { DiffView } from './DiffView';
import { Icon } from './Icon';

type ApprovalItem = Extract<Item, { kind: 'approval' }>;

const ANSWER_TEXT: Record<string, string> = {
  allow_once: '已允许这一次',
  allow_session: '本次对话内已允许同类操作',
  deny: '已拒绝',
  deny_feedback: '已拒绝并说明了原因',
  cancel: '已取消',
  approve: '已批准计划',
  reject: '计划已退回',
};

const TOOL_TITLE: Record<string, string> = {
  write_file: '要写入文件',
  shell: '要执行命令',
};

function isPlain(answer?: string): boolean {
  return answer === 'allow_once' || answer === 'allow_session' || answer === 'approve';
}

function PermissionBody(props: { item: ApprovalItem; settled: boolean }): React.ReactElement {
  const store = useStore();
  const { approval } = props.item;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const primary = useRef<HTMLButtonElement>(null);

  // Move focus to the safest-to-confirm control so the keyboard can answer straight away.
  useEffect(() => {
    if (!props.settled) primary.current?.focus({ preventScroll: false });
  }, [props.settled]);

  const send = (answer: string, text?: string): void => { void store.approve(answer, text); };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (props.settled || feedbackOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      send('deny');
    }
  };

  const title = TOOL_TITLE[approval.toolName] || `要使用 ${approval.toolName}`;
  return (
    <div onKeyDown={onKeyDown}>
      <header className="approval-head">
        <Icon name="shield" size={18} className="approval-icon" />
        <div>
          <h3>{title}</h3>
          <p className="approval-reason">{approval.summary ? <code>{approval.summary}</code> : approval.reason}</p>
        </div>
      </header>

      {approval.warning && (
        <p className="approval-warning" role="alert">
          <Icon name="alert" size={16} />
          {approval.warning}
        </p>
      )}

      {approval.file && <DiffView file={approval.file} />}

      {!props.settled && !feedbackOpen && (
        <div className="approval-actions">
          <button ref={primary} type="button" className="btn btn-primary" onClick={() => send('allow_once')}>
            允许这一次 <kbd>Enter</kbd>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => send('allow_session')}>本次对话都允许</button>
          <button type="button" className="btn btn-ghost" onClick={() => send('deny')}>拒绝 <kbd>Esc</kbd></button>
          <button type="button" className="btn btn-ghost" onClick={() => setFeedbackOpen(true)}>拒绝并说明…</button>
        </div>
      )}

      {!props.settled && feedbackOpen && (
        <form
          className="approval-feedback"
          onSubmit={(event) => { event.preventDefault(); send('deny_feedback', feedback); }}
        >
          <label htmlFor={`fb-${approval.id}`}>告诉助手该怎么做（它会据此继续）</label>
          <textarea id={`fb-${approval.id}`} rows={2} value={feedback} autoFocus onChange={(event) => setFeedback(event.target.value)} />
          <div className="approval-actions">
            <button type="submit" className="btn btn-primary" disabled={!feedback.trim()}>拒绝并发送</button>
            <button type="button" className="btn btn-ghost" onClick={() => setFeedbackOpen(false)}>返回</button>
          </div>
        </form>
      )}
    </div>
  );
}

function PlanBody(props: { item: ApprovalItem; settled: boolean }): React.ReactElement {
  const store = useStore();
  const { approval } = props.item;
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!props.settled) primary.current?.focus(); }, [props.settled]);

  return (
    <div>
      <header className="approval-head">
        <Icon name="list" size={18} className="approval-icon" />
        <div>
          <h3>助手提交了一份计划</h3>
          <p className="approval-reason">批准后会切换到执行模式，之后每次改文件仍会先问你。</p>
        </div>
      </header>
      <pre className="plan-text">{approval.plan || '（计划内容为空）'}</pre>
      {!props.settled && (
        <div className="approval-actions">
          <button ref={primary} type="button" className="btn btn-primary" onClick={() => void store.approve('approve')}>批准并开始实现</button>
          <button type="button" className="btn btn-secondary" onClick={() => void store.approve('reject')}>继续修改计划</button>
        </div>
      )}
    </div>
  );
}

export function ApprovalCard(props: { item: ApprovalItem }): React.ReactElement {
  const { item } = props;
  const settled = item.answer !== undefined;
  const refused = settled && !isPlain(item.answer);

  return (
    <section
      className={`approval${settled ? ' is-settled' : ''}${refused ? ' is-refused' : ''}`}
      aria-label={settled ? '已处理的批准请求' : '需要你批准'}
      aria-live="polite"
    >
      {item.approval.kind === 'plan'
        ? <PlanBody item={item} settled={settled} />
        : <PermissionBody item={item} settled={settled} />}
      {settled && (
        <p className="approval-result">
          <Icon name={refused ? 'x' : 'check'} size={14} />
          {ANSWER_TEXT[item.answer as string] || '已处理'}
        </p>
      )}
    </section>
  );
}
