import React from 'react';
import type { ConversationMessage } from './types';

const VISIBLE_MESSAGE_LIMIT = 80;

function renderInline(value: string): React.ReactNode[] {
  const parts = value.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function renderMarkdown(content: string): React.ReactElement[] {
  const lines = content.split(/\r?\n/);
  const rendered: React.ReactElement[] = [];
  let code: string[] = [];
  let inCode = false;

  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        rendered.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>);
        code = [];
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
      code.push(line);
      return;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      rendered.push(<p className="mdBullet" key={index}>{renderInline(line.replace(/^\s*[-*]\s+/, ''))}</p>);
      return;
    }
    if (/^\s*\|.+\|\s*$/.test(line)) {
      rendered.push(<pre className="mdTable" key={index}>{line}</pre>);
      return;
    }
    rendered.push(<p key={index}>{renderInline(line)}</p>);
  });

  if (code.length) rendered.push(<pre key="code-tail"><code>{code.join('\n')}</code></pre>);
  return rendered;
}

function MessageListView(props: { messages: ConversationMessage[] }): React.ReactElement {
  const visibleMessages = props.messages.slice(-VISIBLE_MESSAGE_LIMIT);

  return (
    <div className="messageList" aria-label="Conversation">
      {visibleMessages.map((message) => (
        <article className={`messageRow ${message.role}`} key={message.id}>
          <div className="messageAvatar">{message.role === 'assistant' ? 'AI' : message.role.slice(0, 2)}</div>
          <div className="messageBody">
            <header>
              <strong>{message.role}</strong>
              {message.meta && <span>{message.meta}</span>}
            </header>
            <div className="markdownBody">{renderMarkdown(message.content)}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

export const MessageList = React.memo(MessageListView);
