import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Icon } from './Icon';

const REMARK = [remarkGfm];
const REHYPE: any[] = [[rehypeHighlight, { detect: true, ignoreMissing: true }]];

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

function CodeBlock(props: { children?: React.ReactNode }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(textOf(props.children).replace(/\n$/, ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard can be unavailable; the code stays selectable */ }
  }

  return (
    <div className="code-block">
      <button type="button" className="code-copy" onClick={() => void copy()} aria-label={copied ? '已复制' : '复制代码'}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
        {copied ? '已复制' : '复制'}
      </button>
      <pre>{props.children}</pre>
    </div>
  );
}

const COMPONENTS = {
  pre: CodeBlock,
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="table-scroll"><table {...props} /></div>
  ),
};

export const Markdown = React.memo(function Markdown(props: { text: string }): React.ReactElement {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={COMPONENTS as any}>
        {props.text}
      </ReactMarkdown>
    </div>
  );
});
