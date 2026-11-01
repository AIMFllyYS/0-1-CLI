import React, { useState } from 'react';
import type { Item } from '../state/transcript';
import { DiffView } from './DiffView';
import { Icon } from './Icon';
import type { IconName } from './Icon';

type ToolItem = Extract<Item, { kind: 'tool' }>;

const LABEL: Record<string, { text: string; icon: IconName }> = {
  read_file: { text: '读取文件', icon: 'file' },
  list_files: { text: '查看目录', icon: 'folder' },
  search_files: { text: '搜索内容', icon: 'search' },
  write_file: { text: '写入文件', icon: 'file' },
  shell: { text: '执行命令', icon: 'terminal' },
  exit_plan_mode: { text: '提交计划', icon: 'list' },
};

const STATUS_TEXT: Record<ToolItem['status'], string> = {
  running: '进行中',
  waiting: '等待批准',
  done: '完成',
  denied: '已拒绝',
  error: '未完成',
};

function StatusMark(props: { status: ToolItem['status'] }): React.ReactElement {
  if (props.status === 'running') return <span className="spinner" role="status" aria-label="进行中" />;
  const icon: IconName = props.status === 'done' ? 'check' : props.status === 'waiting' ? 'shield' : props.status === 'denied' ? 'x' : 'alert';
  return <Icon name={icon} size={15} className={`status-${props.status}`} label={STATUS_TEXT[props.status]} />;
}

export function ToolRow(props: { item: ToolItem }): React.ReactElement {
  const { item } = props;
  const meta = LABEL[item.name] || { text: item.name, icon: 'wrench' as IconName };
  const expandable = Boolean(item.preview) || Boolean(item.file);
  const [open, setOpen] = useState(Boolean(item.file));

  return (
    <div className={`tool is-${item.status}`}>
      <button
        type="button"
        className="tool-head"
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={meta.icon} size={15} className="tool-icon" />
        <span className="tool-name">{meta.text}</span>
        {item.summary && <code className="tool-target" title={item.summary}>{item.summary}</code>}
        <span className="tool-status"><StatusMark status={item.status} /></span>
        {expandable && <Icon name={open ? 'chevronDown' : 'chevron'} size={14} className="tool-chevron" />}
      </button>
      {open && (
        <div className="tool-detail">
          {item.file && <DiffView file={item.file} />}
          {item.preview && !item.file && <pre className="tool-preview">{item.preview}</pre>}
        </div>
      )}
    </div>
  );
}
