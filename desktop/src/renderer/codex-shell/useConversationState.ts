import { useMemo, useState } from 'react';
import type { ActivityItem, ConversationMessage, ConversationSession, Mode } from './types';

const MODE_HINTS: Record<Mode, string> = {
  chat: 'read-only conversation',
  agent: 'asks before tools',
  plan: 'plan review, no edits',
};

const START_SESSIONS: ConversationSession[] = [
  { id: 'local', title: 'My-CLI workspace', subtitle: 'D:/new_project/My-CLI', status: 'active' },
  { id: 'plan', title: 'Plan review', subtitle: 'approval flow', status: 'ready' },
  { id: 'skills', title: 'Skills context', subtitle: 'runtime guidance', status: 'queued' },
];

const START_MESSAGES: Record<string, ConversationMessage[]> = {
  local: [
    { id: 'system-1', role: 'system', content: '0-1 CLI Desktop is now an embedded AI workspace: chat, agent, plan, skills, and tool activity live in one shell.', meta: 'runtime' },
    { id: 'assistant-1', role: 'assistant', content: 'Ask in the composer below. Responses render as rich markdown, while tool activity and plan state stay visible above the thread.', meta: 'ready' },
  ],
  plan: [
    { id: 'plan-1', role: 'assistant', content: 'Plan mode is read-only until you approve an implementation path.', meta: 'plan' },
  ],
  skills: [
    { id: 'skills-1', role: 'assistant', content: 'Skills context is available to guide task-specific reasoning and agent behavior.', meta: 'skills' },
  ],
};

const START_ACTIVITY: ActivityItem[] = [
  { title: 'Thinking', status: 'idle', detail: 'Reasoning and status updates appear here while the agent works.' },
  { title: 'Tools', status: 'guarded', detail: 'Tool calls use the same permission-aware runtime as the CLI.' },
  { title: 'Plan', status: 'locked', detail: 'Plan approval keeps write actions explicit.' },
];

function createMessage(role: ConversationMessage['role'], content: string, meta?: string): ConversationMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    meta,
  };
}

export function useConversationState() {
  const [sessions, setSessions] = useState<ConversationSession[]>(START_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState('local');
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ConversationMessage[]>>(START_MESSAGES);
  const [activity, setActivity] = useState<ActivityItem[]>(START_ACTIVITY);
  const [mode, setMode] = useState<Mode>('chat');
  const [aiBusy, setAiBusy] = useState(false);

  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0];
  const messages = messagesBySession[activeSessionId] || [];
  const title = useMemo(() => `${activeSession.title} / ${MODE_HINTS[mode]}`, [activeSession.title, mode]);

  function appendMessage(sessionId: string, message: ConversationMessage): void {
    setMessagesBySession((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] || []), message],
    }));
  }

  function createSession(): void {
    const id = `session-${Date.now()}`;
    setSessions((current) => [
      { id, title: 'Untitled chat', subtitle: 'new conversation', status: 'active' },
      ...current.map((item) => ({ ...item, status: item.status === 'active' ? 'ready' as const : item.status })),
    ]);
    setMessagesBySession((current) => ({
      ...current,
      [id]: [createMessage('assistant', 'New conversation ready. Choose a mode and start typing.', 'ready')],
    }));
    setActiveSessionId(id);
  }

  async function sendMessage(text: string): Promise<void> {
    const userMessage = createMessage('user', text, `/${mode}`);
    appendMessage(activeSessionId, userMessage);
    setAiBusy(true);
    setActivity([{ title: 'Thinking', status: 'running', detail: 'The embedded agent is preparing a response.' }, ...START_ACTIVITY.slice(1)]);
    try {
      if (!window.zeroOneCli?.sendAiMessage) {
        appendMessage(activeSessionId, createMessage('assistant', 'Desktop bridge is unavailable in browser preview.', 'offline'));
        return;
      }
      const response = await window.zeroOneCli.sendAiMessage({
        sessionId: activeSessionId,
        mode,
        text,
      });
      if (response.activity?.length) setActivity(response.activity);
      appendMessage(activeSessionId, response.message || createMessage('assistant', response.output || response.error || 'No response returned.', response.ok ? 'done' : 'error'));
    } finally {
      setAiBusy(false);
    }
  }

  return {
    activity,
    activeSessionId,
    aiBusy,
    createSession,
    messages,
    mode,
    sendMessage,
    sessions,
    setActiveSessionId,
    setMode,
    title,
  };
}
