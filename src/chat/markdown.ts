import {
  divider,
  INDENT,
  renderCodeBlockBottom,
  renderCodeBlockLine,
  renderCodeBlockTop,
  renderQuoteLine,
  ui,
} from './ui/theme';

export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
        out.push(renderCodeBlockTop(codeLang));
      } else {
        inCodeBlock = false;
        codeLang = '';
        out.push(renderCodeBlockBottom());
      }
      continue;
    }

    if (inCodeBlock) {
      out.push(renderCodeBlockLine(line));
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      out.push(`${INDENT}${divider(56)}`);
      continue;
    }

    const h3 = line.match(/^### (.+)/);
    if (h3) { out.push(ui.h3(`   ${h3[1]}`)); continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { out.push(ui.h2(`  ${h2[1]}`)); continue; }
    const h1 = line.match(/^# (.+)/);
    if (h1) { out.push(ui.h1(` ${h1[1]}`)); continue; }

    if (line.trimStart().startsWith('> ')) {
      out.push(renderQuoteLine(renderInline(line.trimStart().slice(2))));
      continue;
    }

    if (/^\|(.+)\|$/.test(line.trim())) {
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) {
        out.push(ui.muted(`${INDENT}├${'─'.repeat(56)}`));
        continue;
      }
      const cells = line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
      const row = cells.map((cell) => ui.strong(renderInline(cell))).join(ui.muted(' │ '));
      out.push(ui.muted(`${INDENT}│ `) + row);
      continue;
    }

    const bullet = line.match(/^(\s*)([-*]) (.+)/);
    if (bullet) {
      out.push(`${bullet[1]}${ui.muted(`${INDENT}• `)}${renderInline(bullet[3])}`);
      continue;
    }

    const numbered = line.match(/^(\s*)(\d+)\. (.+)/);
    if (numbered) {
      out.push(`${numbered[1]}${ui.muted(`${INDENT}${numbered[2]}. `)}${renderInline(numbered[3])}`);
      continue;
    }

    if (!line.trim()) {
      out.push('');
      continue;
    }

    out.push(`${INDENT}${renderInline(line)}`);
  }

  return out.join('\n');
}

export function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, value) => ui.strong(value))
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (_, value) => ui.italic(value))
    .replace(/~~(.+?)~~/g, (_, value) => ui.strike(value))
    .replace(/`([^`]+)`/g, (_, value) => ui.inlineCode(value))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `${ui.link(label)}${ui.muted(` (${url})`)}`);
}
