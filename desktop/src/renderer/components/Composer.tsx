import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks';
import type { Session } from '../state/store';
import { pendingApproval } from '../state/transcript';
import type { Mode } from '../state/transcript';
import { Icon } from './Icon';

const MODES: Array<{ mode: Mode; label: string; hint: string }> = [
  { mode: 'chat', label: '只读', hint: '只读文件、回答问题，不做任何改动' },
  { mode: 'agent', label: '执行', hint: '可以改文件、跑命令，每次都先问你' },
  { mode: 'plan', label: '计划', hint: '先出方案，你批准后才动手' },
];

const NEXT: Record<Mode, Mode> = { chat: 'agent', agent: 'plan', plan: 'chat' };

export function Composer(props: { session: Session | undefined; focusSignal: number }): React.ReactElement {
  const store = useStore();
  const { session } = props;
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  const running = Boolean(session?.running);
  const waiting = session ? pendingApproval(session) !== undefined : false;
  const mode: Mode = session?.mode ?? 'chat';

  useEffect(() => { area.current?.focus(); }, [props.focusSignal, session?.id]);

  // The approval buttons disappear once answered, which would drop focus to the page; hand it back to the input.
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (wasWaiting.current && !waiting) area.current?.focus();
    wasWaiting.current = waiting;
  }, [waiting]);

  // Grow with the content up to a cap, then scroll.
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = 'auto';
    const wanted = element.scrollHeight;
    element.style.height = `${Math.min(wanted, 220)}px`;
    // Only show a scrollbar once the text really exceeds the cap.
    element.style.overflowY = wanted > 220 ? 'auto' : 'hidden';
  }, [text]);

  async function submit(): Promise<void> {
    const value = text.trim();
    if (!value || running) return;
    setText('');
    const result = await store.send(value);
    if (!result.ok) setText(value);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.nativeEvent.isComposing || composing.current) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Tab' && event.shiftKey && session && !running) {
      event.preventDefault();
      void store.setMode(NEXT[mode]);
    } else if (event.key === 'Escape' && running) {
      event.preventDefault();
      void store.stop();
    }
  }

  const placeholder = waiting
    ? '上面有一个操作在等你批准'
    : running ? '助手正在工作…按 Esc 可以停止' : '问点什么，或描述要做的改动';

  return (
    <div className="composer-wrap">
      <div className={`composer${running ? ' is-running' : ''}`}>
        <label htmlFor="composer-input" className="sr-only">给助手的消息</label>
        <textarea
          id="composer-input"
          ref={area}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
        />
        <div className="composer-bar">
          <div className="mode-switch" role="radiogroup" aria-label="工作模式">
            {MODES.map((item) => (
              <button
                key={item.mode}
                type="button"
                role="radio"
                aria-checked={mode === item.mode}
                title={item.hint}
                disabled={!session || running}
                className={`mode-option${mode === item.mode ? ' is-active' : ''}`}
                onClick={() => void store.setMode(item.mode)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="composer-hint">{MODES.find((item) => item.mode === mode)?.hint}</span>
          {running ? (
            <button type="button" className="btn btn-secondary composer-send" onClick={() => void store.stop()} aria-label="停止">
              <Icon name="stop" size={14} />
              停止
            </button>
          ) : (
            <button type="button" className="btn btn-primary composer-send" disabled={!text.trim()} onClick={() => void submit()} aria-label="发送">
              <Icon name="send" size={16} />
            </button>
          )}
        </div>
      </div>
      <p className="composer-foot"><kbd>Enter</kbd> 发送 · <kbd>Shift Enter</kbd> 换行 · <kbd>Shift Tab</kbd> 切换模式</p>
    </div>
  );
}
