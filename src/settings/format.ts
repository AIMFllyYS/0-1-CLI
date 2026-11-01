import { SETTING_DEFS, getSettingValue } from './schema';
import type { Settings } from './schema';

function show(value: boolean | number | string): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return value === '' ? '（空）' : String(value);
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) width += (char.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
  return width;
}

function pad(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)));
}

export function formatSettingsList(settings: Settings, options: { json: boolean }): string {
  const rows = SETTING_DEFS.map((def) => {
    const value = getSettingValue(settings, def.key);
    return {
      key: def.key,
      value,
      default: def.default,
      isDefault: value === def.default,
      description: def.description,
    };
  });

  if (options.json) return JSON.stringify(rows, null, 2);

  const header = ['设置项', '当前值', '说明'];
  const body = rows.map((row) => [
    row.key,
    row.isDefault ? `${show(row.value)}（默认）` : show(row.value),
    row.description,
  ]);
  const widths = header.map((title, column) =>
    Math.max(displayWidth(title), ...body.map((cells) => displayWidth(cells[column]))),
  );
  const render = (cells: string[]) => cells.map((cell, column) => pad(cell, widths[column])).join('  ').trimEnd();

  return [render(header), ...body.map(render)].join('\n');
}
