import type { GridStats } from '../model/stats';

/** UTF-8 BOM。没有它 Excel 打开中文会乱码。 */
export const CSV_BOM = '﻿';

function escapeCsv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 采购清单 CSV。列：色号,颜色名,中文名,HEX,颗数,占比 */
export function statsToCsv(stats: GridStats): string {
  const rows = [['色号', '颜色名', '中文名', 'HEX', '颗数', '占比']];
  for (const u of stats.usages) {
    rows.push([
      u.bead.code,
      u.bead.name,
      u.bead.nameZh,
      u.bead.hex,
      String(u.count),
      `${(u.ratio * 100).toFixed(2)}%`,
    ]);
  }
  return CSV_BOM + rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
}

export function downloadText(
  filename: string,
  text: string,
  mime = 'text/csv;charset=utf-8',
): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // 立刻 revoke 会让 Safari 下载失败，延后一拍
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
