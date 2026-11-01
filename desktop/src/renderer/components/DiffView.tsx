import React from 'react';
import type { FileChange } from '../state/transcript';
import { Icon } from './Icon';

const OPERATION: Record<FileChange['operation'], string> = {
  create: '新建',
  overwrite: '覆盖',
  edit: '修改',
};

// A unified diff of one file: counts in the header, then the changed lines with a little context.
export function DiffView(props: { file: FileChange; compact?: boolean }): React.ReactElement {
  const { file } = props;
  return (
    <figure className={`diff${props.compact ? ' diff-compact' : ''}`}>
      <figcaption className="diff-head">
        <Icon name="file" size={14} />
        <code className="diff-path" title={file.path}>{file.path}</code>
        <span className="diff-op">{OPERATION[file.operation]}</span>
        <span className="diff-count diff-count-add" aria-label={`新增 ${file.added} 行`}>+{file.added}</span>
        <span className="diff-count diff-count-del" aria-label={`删除 ${file.removed} 行`}>−{file.removed}</span>
      </figcaption>

      {file.hunks.length > 0 ? (
        <div className="diff-body" role="table" aria-label={`${file.path} 的改动`}>
          {file.hunks.map((line, index) => (
            <div
              key={index}
              role="row"
              className={`diff-line${line.marker === '+' ? ' is-add' : line.marker === '-' ? ' is-del' : ''}`}
            >
              <span className="diff-no" role="cell">{line.lineNo ?? ''}</span>
              <span className="diff-mark" role="cell" aria-label={line.marker === '+' ? '新增' : line.marker === '-' ? '删除' : '未变'}>{line.marker === ' ' ? '' : line.marker}</span>
              <code className="diff-code" role="cell">{line.code || ' '}</code>
            </div>
          ))}
        </div>
      ) : (
        <p className="diff-empty">{file.truncated ? '改动较大，已省略逐行预览。' : '内容没有变化。'}</p>
      )}
      {file.truncated && file.hunks.length > 0 && <p className="diff-empty">仅显示前一部分改动。</p>}
    </figure>
  );
}
