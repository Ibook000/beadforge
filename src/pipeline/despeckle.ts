import { cloneGrid, type BeadGrid } from '../model/grid';

export type DespeckleLevel = 'off' | 'weak' | 'strong';

/**
 * 阈值含义：中心格的颜色在 3×3 窗口内（含自身）出现次数 ≤ 阈值时被替换。
 * weak = 1 只清完全孤立的单颗；strong = 2 连孤立的对子一起清。
 */
const THRESHOLD: Record<DespeckleLevel, number> = { off: 0, weak: 1, strong: 2 };

/**
 * 去除孤立的单颗/对子豆，替换为 3×3 窗口内的众数色。
 *
 * 为什么需要：误差扩散和照片噪点都会产生孤立单豆。在屏幕上是一个像素，
 * 在实拼时是一次找豆、一次插针的手工劳动，而且拼出来往往比轻微色带更难看。
 * 把它当算法问题解决，而不是丢给用户手动擦。
 *
 * 读取全部来自输入、写入全部到输出 —— 不会出现"刚改过的格子影响后续判断"
 * 的级联效应，结果与扫描顺序无关。
 */
export function despeckle(grid: BeadGrid, level: DespeckleLevel): BeadGrid {
  const threshold = THRESHOLD[level];
  if (threshold === 0) return cloneGrid(grid);

  const out = cloneGrid(grid);
  const { width: w, height: h } = grid;
  const counts = new Map<number, number>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (grid.mask[i] !== 1) continue;

      counts.clear();
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (grid.mask[ni] !== 1) continue; // 空格不参与统计
          const v = grid.cells[ni]!;
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }

      const self = grid.cells[i]!;
      if ((counts.get(self) ?? 0) > threshold) continue;

      // 找众数；平局时取豆号较小的，保证结果确定
      let mode = self;
      let modeCount = -1;
      for (const [v, c] of counts) {
        if (c > modeCount || (c === modeCount && v < mode)) {
          mode = v;
          modeCount = c;
        }
      }
      out.cells[i] = mode;
    }
  }

  return out;
}
