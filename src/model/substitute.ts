import type { BeadGrid } from './grid';
import type { Palette, Bead } from '../palette/types';
import { ciede2000 } from '../color/distance';

/** 一个缺色候选推荐（用户没此色时最接近的替代） */
export interface SubCandidate {
  /** 替代豆号在 palette.beads 中的下标 */
  index: number;
  bead: Bead;
  /** CIEDE2000 色差 ΔE，越小越接近 */
  deltaE: number;
}

/** 一条缺色推荐记录：被缺的色 → 候选替代色列表 */
export interface SubSuggestion {
  /** 被缺的豆号下标（图纸上用到但用户没有的） */
  missingIndex: number;
  bead: Bead;
  /** 按 ΔE 升序的前 N 个候选 */
  candidates: SubCandidate[];
}

/**
 * 对图纸里用到的每个"用户没有的颜色"，找出 allowed 子集里最接近的几个候选替代色。
 *
 * 算法就是 CIEDE2000 色差（和匹配管线同一套），只是入口不同：
 * 生成匹配是"像素→最近豆号"，这里是"已用豆号→子集里最近的几个豆号"。
 *
 * @param grid    图纸（用来取实际用到的色）
 * @param palette 色卡
 * @param allowed 用户拥有的豆子下标集合。空集 = 全选（此时无"缺色"概念，返回空）
 * @param topN    每色推荐几个候选，默认 3
 */
export function suggestSubstitutes(
  grid: BeadGrid,
  palette: Palette,
  allowed: ReadonlySet<number>,
  topN = 3,
): SubSuggestion[] {
  // 全选（空集）没有"缺色"概念
  if (allowed.size === 0) return [];

  const allowedList = [...allowed].filter((i) => i >= 0 && i < palette.beads.length);
  if (allowedList.length === 0) return [];

  // 收集图纸里实际用到的色下标
  const used = new Set<number>();
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.mask[i] === 1) used.add(grid.cells[i]!);
  }

  const out: SubSuggestion[] = [];
  for (const idx of used) {
    // 只对"用户没有的色"做推荐
    if (allowed.has(idx)) continue;

    const targetLab = palette.beads[idx]!.lab;
    const cands: SubCandidate[] = [];
    for (const a of allowedList) {
      const ab = palette.beads[a]!;
      const d = ciede2000(targetLab, ab.lab);
      cands.push({ index: a, bead: ab, deltaE: d });
    }
    cands.sort((x, y) => x.deltaE - y.deltaE);
    out.push({
      missingIndex: idx,
      bead: palette.beads[idx]!,
      candidates: cands.slice(0, topN),
    });
  }

  // 按最小 ΔE 升序排：最缺（最接近的替代也差）的排后面，最容易替代的排前面
  out.sort((a, b) => a.candidates[0]!.deltaE - b.candidates[0]!.deltaE);
  return out;
}
