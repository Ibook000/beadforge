import { rgbToLab, type RGB, type Lab } from './space';
import { ciede2000 } from './distance';
import type { Bead } from '../palette/types';

export interface Matcher {
  /** 返回最近豆子在 beads 数组中的下标 */
  match(rgb: RGB): number;
  matchLab(lab: Lab): number;
}

/**
 * 创建一个最近色匹配器（CIEDE2000，Lab 空间）。
 *
 * 性能：match() 按打包的 32 位 RGB 缓存结果。降采样后的独立颜色数
 * 远小于格数（一张照片降到 200×200 通常只有几千种独立色），
 * 缓存命中率极高 —— 因此不需要 Web Worker。
 *
 * @param beads   候选豆子（通常是整套色卡）
 * @param allowed 只在这些下标中匹配（「我有的豆子」子集）。
 *                传 undefined 或空集视为全选。
 */
export function createMatcher(beads: readonly Bead[], allowed?: ReadonlySet<number>): Matcher {
  const candidates: number[] =
    allowed && allowed.size > 0
      ? [...allowed].filter((i) => i >= 0 && i < beads.length).sort((a, b) => a - b)
      : beads.map((_, i) => i);

  if (candidates.length === 0) {
    throw new Error('匹配器至少需要一个候选颜色');
  }

  // 预取候选的 Lab，避免每次匹配都走属性访问
  const labs: Lab[] = candidates.map((i) => beads[i]!.lab);

  // 缓存：打包的 RGB → 豆号下标
  const cache = new Map<number, number>();

  function matchLab(lab: Lab): number {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < labs.length; k++) {
      const d = ciede2000(lab, labs[k]!);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return candidates[best]!;
  }

  return {
    match(rgb: RGB): number {
      const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const result = matchLab(rgbToLab(rgb));
      cache.set(key, result);
      return result;
    },
    matchLab,
  };
}
