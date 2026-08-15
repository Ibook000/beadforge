import type { BeadGrid } from './grid';
import type { Bead, Palette } from '../palette/types';

export interface BeadUsage {
  beadIndex: number;
  bead: Bead;
  count: number;
  /** 占比 0–1，分母是 totalBeads */
  ratio: number;
}

export interface GridStats {
  /** 需要的豆子总颗数（不含空格） */
  totalBeads: number;
  /** 用到的颜色种数 */
  colorCount: number;
  /** 空格数 */
  emptyCount: number;
  /** 按颗数降序；颗数相同时按色号升序，保证输出稳定 */
  usages: BeadUsage[];
}

export function computeStats(grid: BeadGrid, palette: Palette): GridStats {
  const counts = new Map<number, number>();
  let total = 0;
  let empty = 0;

  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.mask[i] !== 1) {
      empty++;
      continue;
    }
    const b = grid.cells[i]!;
    counts.set(b, (counts.get(b) ?? 0) + 1);
    total++;
  }

  const usages: BeadUsage[] = [...counts.entries()]
    .map(([beadIndex, count]) => ({
      beadIndex,
      bead: palette.beads[beadIndex]!,
      count,
      ratio: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count || a.bead.code.localeCompare(b.bead.code));

  return { totalBeads: total, colorCount: usages.length, emptyCount: empty, usages };
}
