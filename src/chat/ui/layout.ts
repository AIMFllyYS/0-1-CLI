import { AiMode, PermissionMode } from '../session';
import { getModeConfig } from '../modes';
import { glyphs } from '../terminal-ui';
import { line, truncateVisible, ui, UI_WIDTH, visibleLength } from './theme';
import type { RecentDenial } from '../permissions/engine';
import type { FileChangeOperation } from '../tools/fs-write';

export interface FileChangePreviewInput {
  tool: string;
  filePath: string;
  operation: FileChangeOperation;
  added: number;
  removed: number;
  changed: number;
}

export interface RecentDenialsInput {
  denials: RecentDenial[];
}

export interface StatusHeaderInput {
  project: string;
  mode: AiMode;
  permissionMode: PermissionMode;
  model: string;
  activeSkills?: number;
  runningSubagents?: number;
}

export interface PermissionBoxInput {
  tool: string;
  action: 'allow' | 'ask' | 'deny';
  reason: string;
}

export interface PlanApprovalPanelInput {
  plan: string;
  planFilePath?: string;
  permissions?: Array<{
    action: string;
    reason?: string;
  }>;
}

export interface TimelineEntryInput {
  kind: 'tool' | 'subagent' | 'search' | 'model';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  label: string;
  detail?: string;
}

export function renderModePill(mode: AiMode, permissionMode: PermissionMode): string {
  const config = getModeConfig(mode);
  const label = `[${config.symbol} ${config.shortTitle}]`;
  const suffix = permissionMode === 'bypass'
    ? ' bypass'
    : permissionMode === 'plan'
      ? ' no edits'
      : ` ${config.hint}`;
  const text = `${label}${suffix}`;
  if (config.color === 'plan') return ui.accent(text);
  if (config.color === 'permission') return ui.warning(text);
  if (config.color === 'danger') return ui.danger(text);
  return ui.strong(text);
}

export function renderStatusHeader(input: StatusHeaderInput): string {
  const title = `${ui.brand('0-1 CLI')} ${ui.muted(glyphs.separator)} ${ui.strong(truncateVisible(input.project, 28))}`;
  const meta = [
    renderModePill(input.mode, input.permissionMode),
    `model ${truncateVisible(input.model, 10)}`,
    `技能 ${input.activeSkills || 0}`,
    `子任务 ${input.runningSubagents || 0}`,
  ].join('  ');

  return [
    '',
    `  ${truncateVisible(title, UI_WIDTH)}`,
    `  ${ui.muted(truncateVisible(meta, UI_WIDTH))}`,
    `  ${line(UI_WIDTH)}`,
  ].join('\n');
}

export function renderPermissionBox(input: PermissionBoxInput): string {
  const actionColor = input.action === 'allow' ? ui.success : input.action === 'deny' ? ui.danger : ui.warning;
  return [
    '',
    `  ${ui.warning('Permission')} ${actionColor(input.action.toUpperCase())}`,
    `  ${line(48)}`,
    `  tool   ${ui.strong(truncateVisible(input.tool, 40))}`,
    `  reason ${ui.muted(truncateVisible(input.reason, 56))}`,
    `  ${ui.success('[允许]')}  ${ui.danger('[拒绝]')}  ${ui.muted('[本次会话记住]')}`,
  ].join('\n');
}

export function renderPlanApprovalPanel(input: PlanApprovalPanelInput): string {
  const planLines = input.plan.trim()
    ? input.plan.trim().split(/\r?\n/)
    : ['No plan content was provided.'];
  const output = [
    '',
    `  ${ui.accent('Ready to code?')}`,
    `  ${line(48)}`,
    `  ${ui.strong("Here is 0-1 CLI's plan:")}`,
    `  ${ui.muted('-'.repeat(48))}`,
    ...planLines.map((planLine) => `  ${ui.muted('|')} ${truncateVisible(planLine, 58)}`),
    `  ${ui.muted('-'.repeat(48))}`,
  ];

  if (input.planFilePath) {
    output.push(`  ${ui.muted('Plan file:')} ${truncateVisible(input.planFilePath, 46)}`);
  }

  const permissions = input.permissions || [];
  if (permissions.length) {
    output.push(`  ${ui.strong('Requested permissions:')}`);
    permissions.forEach((permission) => {
      const detail = permission.reason ? `${permission.action}: ${permission.reason}` : permission.action;
      output.push(`  ${ui.muted('-')} ${truncateVisible(detail, 58)}`);
    });
    output.push(`  ${ui.muted(truncateVisible('Permissions listed here are not auto-granted.', 62))}`);
  }

  output.push(
    `  ${ui.muted('0-1 CLI has written up a plan and is ready to execute.')}`,
    `  ${ui.success('[Y] Yes, manually approve edits')}  ${ui.danger('[N] No, keep planning')}`,
    `  ${ui.muted(truncateVisible('Tip: edit the plan file first if you want changes before approval.', 62))}`
  );

  return output.join('\n');
}

export function renderTimelineEntry(input: TimelineEntryInput): string {
  const icon = input.kind === 'subagent' ? glyphs.diamondOpen : input.kind === 'tool' ? glyphs.diamond : glyphs.bullet;
  const labelText = truncateVisible(input.label, 18);
  const status = input.status === 'completed'
    ? ui.success(input.status)
    : input.status === 'failed' || input.status === 'cancelled'
      ? ui.danger(input.status)
      : ui.warning(input.status);
  const plainPrefix = `  ${icon} ${labelText} ${input.status}`;
  const maxLineWidth = UI_WIDTH + 2;
  const maxDetailWidth = Math.max(0, maxLineWidth - visibleLength(plainPrefix) - 3);
  const detail = input.detail && maxDetailWidth > 0 ? ui.muted(` - ${truncateVisible(input.detail, maxDetailWidth)}`) : '';
  return `  ${ui.muted(icon)} ${ui.strong(labelText)} ${status}${detail}`;
}

export function renderRecentDenials(input: RecentDenialsInput): string {
  if (!input.denials.length) return '';
  const header = `  ${ui.warning('Recent Denials')}`;
  const items = input.denials.slice(-5).map((d) => {
    const label = truncateVisible(`${d.toolName}: ${d.reason}`, 56);
    return `  ${ui.danger(glyphs.bullet)} ${ui.muted(label)}`;
  });
  return ['', header, `  ${line(48)}`, ...items].join('\n');
}

export function renderFileChangePreview(input: FileChangePreviewInput): string {
  const opLabels: Record<FileChangeOperation, string> = {
    create: 'Create file',
    overwrite: 'Overwrite file',
    edit: 'Edit file',
  };
  const opColors: Record<FileChangeOperation, (s: string) => string> = {
    create: ui.success,
    overwrite: ui.warning,
    edit: ui.accent,
  };
  const opLabel = opColors[input.operation](opLabels[input.operation]);

  const stats: string[] = [];
  if (input.added > 0) stats.push(ui.success(`+${input.added}`));
  if (input.removed > 0) stats.push(ui.danger(`-${input.removed}`));
  if (input.changed > 0) stats.push(ui.warning(`~${input.changed}`));
  const statsLine = stats.length ? stats.join(' ') : ui.muted('no changes');

  return [
    '',
    `  ${ui.warning('Permission')} ${opLabel}`,
    `  ${line(48)}`,
    `  tool   ${ui.strong(truncateVisible(input.tool, 40))}`,
    `  file   ${ui.muted(truncateVisible(input.filePath, 56))}`,
    `  lines  ${statsLine}`,
    `  ${ui.success('[允许]')}  ${ui.danger('[拒绝]')}  ${ui.muted('[本次会话记住]')}`,
  ].join('\n');
}

export function renderKeyboardHintRow(): string {
  const hints = [
    `${ui.muted('Esc')} dismiss`,
    `${ui.muted('Tab')} complete`,
    `${ui.muted('Enter')} execute`,
    `${ui.muted('Up/Down')} navigate`,
  ];
  return `  ${truncateVisible(hints.join(ui.muted(` ${glyphs.separator} `)), UI_WIDTH)}`;
}
