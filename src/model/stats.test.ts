import { describe, it, expect } from 'vitest';
import { createGrid, setCell } from './grid';
import { computeStats } from './stats';
import type { Palette } from '../palette/types';
import { rgbToLab, type RGB } from '../color/space';

function fakePalette(): Palette {
  const mk = (code: string, rgb: RGB) => ({
    code,
    name: code,
    nameZh: code,
    hex: '#000000',
    rgb,
    lab: rgbToLab(rgb),
  });
  return {
    id: 'mard',
    label: 'test',
    beadSizeMm: 5,
    beads: [mk('A', [255, 0, 0]), mk('B', [0, 255, 0]), mk('C', [0, 0, 255])],
  };
}

describe('computeStats', () => {
  it('应统计各色颗数并按降序排列', () => {
    const g = createGrid(3, 2, 'mard');
    setCell(g, 0, 0, 0);
    setCell(g, 1, 0, 0);
    setCell(g, 2, 0, 0);
    setCell(g, 0, 1, 1);
    setCell(g, 1, 1, 1);
    // (2,1) 留空

    const s = computeStats(g, fakePalette());
    expect(s.totalBeads).toBe(5);
    expect(s.emptyCount).toBe(1);
    expect(s.colorCount).toBe(2);
    expect(s.usages.map((u) => u.bead.code)).toEqual(['A', 'B']);
    expect(s.usages[0]!.count).toBe(3);
    expect(s.usages[1]!.count).toBe(2);
  });

  it('占比之和应为 1', () => {
    const g = createGrid(3, 1, 'mard');
    setCell(g, 0, 0, 0);
    setCell(g, 1, 0, 1);
    setCell(g, 2, 0, 2);
    const s = computeStats(g, fakePalette());
    const sum = s.usages.reduce((a, u) => a + u.ratio, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('空格的 cells 值不应被计入', () => {
    const g = createGrid(2, 1, 'mard');
    // 直接写 cells 但不置 mask —— 模拟管线里残留的脏值
    g.cells[0] = 2;
    setCell(g, 1, 0, 0);
    const s = computeStats(g, fakePalette());
    expect(s.totalBeads).toBe(1);
    expect(s.colorCount).toBe(1);
    expect(s.usages[0]!.bead.code).toBe('A');
  });

  it('颗数相同时应按色号升序，保证输出稳定', () => {
    const g = createGrid(4, 1, 'mard');
    setCell(g, 0, 0, 2);
    setCell(g, 1, 0, 2);
    setCell(g, 2, 0, 0);
    setCell(g, 3, 0, 0);
    const s = computeStats(g, fakePalette());
    expect(s.usages.map((u) => u.bead.code)).toEqual(['A', 'C']);
  });

  it('全空网格应返回空统计而不崩', () => {
    const s = computeStats(createGrid(2, 2, 'mard'), fakePalette());
    expect(s.totalBeads).toBe(0);
    expect(s.colorCount).toBe(0);
    expect(s.emptyCount).toBe(4);
    expect(s.usages).toEqual([]);
  });
});
