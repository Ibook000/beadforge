import { describe, it, expect } from 'vitest';
import { suggestSubstitutes } from './substitute';
import type { BeadGrid } from './grid';
import type { Palette, Bead } from '../palette/types';
import type { Lab } from '../color/space';

function makeBead(code: string, lab: Lab): Bead {
  return {
    code,
    name: code,
    nameZh: code,
    hex: '#000000',
    rgb: [0, 0, 0],
    lab,
  };
}

const palette: Palette = {
  id: 'mard',
  label: 'test',
  beadSizeMm: 5,
  // 0: 黑、1: 白、2: 暗红、3: 亮红、4: 蓝
  beads: [
    makeBead('BLACK', [0, 0, 0]),
    makeBead('WHITE', [100, 0, 0]),
    makeBead('DRED', [40, 60, 30]),
    makeBead('LRED', [60, 70, 40]),
    makeBead('BLUE', [40, -20, -40]),
  ],
};

function grid(cells: number[]): BeadGrid {
  const n = cells.length;
  const mask = new Uint8Array(n).fill(1);
  return {
    width: n,
    height: 1,
    paletteId: 'mard',
    cells: new Uint16Array(cells),
    mask,
  };
}

describe('suggestSubstitutes', () => {
  it('全选（空集）时无缺色概念，返回空', () => {
    const g = grid([0, 1, 2]);
    expect(suggestSubstitutes(g, palette, new Set())).toEqual([]);
  });

  it('用户拥有用到的全部色时返回空', () => {
    const g = grid([0, 1, 2]);
    const allowed = new Set([0, 1, 2, 3, 4]);
    expect(suggestSubstitutes(g, palette, allowed)).toEqual([]);
  });

  it('对缺色推荐子集里最接近的候选，按 ΔE 升序', () => {
    // 用到 DRED(2) 和 BLUE(4)，用户只有 BLACK(0) WHITE(1) LRED(3)
    const g = grid([2, 2, 4, 4]);
    const allowed = new Set([0, 1, 3]);
    const out = suggestSubstitutes(g, palette, allowed);
    // 两种缺色：DRED(2) 和 BLUE(4)
    expect(out).toHaveLength(2);

    // DRED(2) 的最近候选应是 LRED(3)（同红系，ΔE 小）
    const dred = out.find((s) => s.missingIndex === 2)!;
    expect(dred.candidates[0]!.index).toBe(3);

    // 每条候选按 ΔE 升序
    for (const s of out) {
      for (let i = 1; i < s.candidates.length; i++) {
        expect(s.candidates[i]!.deltaE).toBeGreaterThanOrEqual(s.candidates[i - 1]!.deltaE);
      }
    }
  });

  it('结果按最小 ΔE 升序排（最易替代的在前）', () => {
    const g = grid([2, 4]);
    const allowed = new Set([0, 1, 3]);
    const out = suggestSubstitutes(g, palette, allowed);
    expect(out).toHaveLength(2);
    // DRED→LRED 色差小，应排在 BLUE→? 前面
    expect(out[0]!.missingIndex).toBe(2);
  });

  it('只对图纸实际用到的缺色做推荐', () => {
    // 只用到 DRED(2)，不用 BLUE(4)
    const g = grid([2, 2, 0, 1]);
    const allowed = new Set([0, 1, 3]);
    const out = suggestSubstitutes(g, palette, allowed);
    // 只有 DRED 是缺色（0/1 用户有，4 没用到）
    expect(out).toHaveLength(1);
    expect(out[0]!.missingIndex).toBe(2);
  });

  it('topN 限制候选数量', () => {
    const g = grid([2]);
    const allowed = new Set([0, 1, 3]);
    const out = suggestSubstitutes(g, palette, allowed, 1);
    expect(out[0]!.candidates).toHaveLength(1);
  });
});
