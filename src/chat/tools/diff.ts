export interface DiffLine {
  marker: '+' | '-' | ' ';
  // Line number in the resulting file; absent for removed lines.
  lineNo?: number;
  code: string;
}

export interface LineDiff {
  added: number;
  removed: number;
  hunks: DiffLine[];
  // True when the input was too large for a line-accurate diff; counts are approximate and hunks are empty.
  truncated: boolean;
}

const CONTEXT_LINES = 2;
const MAX_LCS_CELLS = 4_000_000;
const MAX_HUNK_LINES = 400;

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

type Op = { kind: 'keep' | 'add' | 'del'; text: string };

function diffOps(before: string[], after: string[]): Op[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }

  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  const ops: Op[] = before.slice(0, start).map((text) => ({ kind: 'keep', text }));

  // Table of LCS lengths over the changed middle only.
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'keep', text: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ kind: 'del', text: a[i] });
      i += 1;
    } else {
      ops.push({ kind: 'add', text: b[j] });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) ops.push({ kind: 'del', text: a[i] });
  for (; j < b.length; j += 1) ops.push({ kind: 'add', text: b[j] });

  for (const text of before.slice(endBefore)) ops.push({ kind: 'keep', text });
  return ops;
}

function approximateCounts(before: string[], after: string[]): { added: number; removed: number } {
  const counts = new Map<string, number>();
  for (const line of before) counts.set(line, (counts.get(line) || 0) + 1);
  let common = 0;
  for (const line of after) {
    const remaining = counts.get(line) || 0;
    if (remaining > 0) {
      counts.set(line, remaining - 1);
      common += 1;
    }
  }
  return { added: after.length - common, removed: before.length - common };
}

export function buildLineDiff(beforeText: string, afterText: string): LineDiff {
  const before = splitLines(beforeText);
  const after = splitLines(afterText);

  // Strip the shared prefix and suffix first; only the changed middle costs quadratic work.
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;
  const middle = (before.length - prefix - suffix + 1) * (after.length - prefix - suffix + 1);

  if (middle > MAX_LCS_CELLS) {
    return { ...approximateCounts(before, after), hunks: [], truncated: true };
  }

  const ops = diffOps(before, after);
  if (!ops.some((op) => op.kind !== 'keep')) {
    return { added: 0, removed: 0, hunks: [], truncated: false };
  }

  const numbered: DiffLine[] = [];
  let newLine = 0;
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === 'del') {
      removed += 1;
      numbered.push({ marker: '-', code: op.text });
    } else {
      newLine += 1;
      if (op.kind === 'add') added += 1;
      numbered.push({ marker: op.kind === 'add' ? '+' : ' ', lineNo: newLine, code: op.text });
    }
  }

  // Keep changed lines plus a little context around them.
  const keep = new Array<boolean>(numbered.length).fill(false);
  numbered.forEach((line, index) => {
    if (line.marker === ' ') return;
    const from = Math.max(0, index - CONTEXT_LINES);
    const to = Math.min(numbered.length - 1, index + CONTEXT_LINES);
    for (let k = from; k <= to; k += 1) keep[k] = true;
  });

  const hunks = numbered.filter((_, index) => keep[index]);
  const truncated = hunks.length > MAX_HUNK_LINES;
  return {
    added,
    removed,
    hunks: truncated ? hunks.slice(0, MAX_HUNK_LINES) : hunks,
    truncated,
  };
}
