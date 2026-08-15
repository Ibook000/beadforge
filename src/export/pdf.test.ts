import { describe, it, expect } from 'vitest';
import { planPages, sliceGrid } from './pdf';
import { createGrid, setCell } from '../model/grid';

describe('planPages', () => {
  it('图纸放得下一页时只产出一页', () => {
    const pages = planPages(createGrid(29, 29, 'mard'), 50, 32, 1);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ index: 0, col: 0, row: 0, x0: 0, y0: 0, x1: 29, y1: 29 });
  });

  it('超出时应按列行切页', () => {
    const pages = planPages(createGrid(100, 60, 'mard'), 40, 50, 1);
    expect(new Set(pages.map((p) => p.col)).size).toBe(3);
    expect(new Set(pages.map((p) => p.row)).size).toBe(2);
    expect(pages).toHaveLength(6);
  });

  it('相邻页应有重叠', () => {
    const pages = planPages(createGrid(100, 20, 'mard'), 40, 50, 1);
    const first = pages.find((p) => p.col === 0)!;
    const second = pages.find((p) => p.col === 1)!;
    expect(second.x0).toBeLessThan(first.x1);
  });

  it('页面范围不应越界，且每页至少一格', () => {
    const g = createGrid(100, 60, 'mard');
    for (const p of planPages(g, 40, 50, 1)) {
      expect(p.x0).toBeGreaterThanOrEqual(0);
      expect(p.y0).toBeGreaterThanOrEqual(0);
      expect(p.x1).toBeLessThanOrEqual(g.width);
      expect(p.y1).toBeLessThanOrEqual(g.height);
      expect(p.x1).toBeGreaterThan(p.x0);
      expect(p.y1).toBeGreaterThan(p.y0);
    }
  });

  it('index 应从 0 连续递增', () => {
    expect(planPages(createGrid(100, 60, 'mard'), 40, 50, 1).map((p) => p.index)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it('页面应覆盖整张图纸不留缝（含尺寸不整除的情况）', () => {
    for (const [w, h] of [
      [93, 47],
      [100, 60],
      [201, 199],
      [51, 33],
    ] as const) {
      const g = createGrid(w, h, 'mard');
      const covered = new Set<string>();
      for (const p of planPages(g, 50, 32, 1)) {
        for (let y = p.y0; y < p.y1; y++) {
          for (let x = p.x0; x < p.x1; x++) covered.add(`${x},${y}`);
        }
      }
      expect(covered.size).toBe(w * h);
    }
  });

  it('不应产生只有一两格的残页', () => {
    // 51 宽、每页 50 格：朴素切法会产生一个 1 格宽的第二页
    const pages = planPages(createGrid(51, 10, 'mard'), 50, 32, 1);
    for (const p of pages) expect(p.x1 - p.x0).toBeGreaterThan(5);
  });
});

describe('sliceGrid', () => {
  it('应正确裁出子区域的 cells 与 mask', () => {
    const g = createGrid(4, 3, 'mard');
    setCell(g, 2, 1, 42);
    setCell(g, 3, 2, 7);

    const s = sliceGrid(g, { index: 0, col: 0, row: 0, x0: 2, y0: 1, x1: 4, y1: 3 });
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
    expect(s.cells[0]).toBe(42);
    expect(s.mask[0]).toBe(1);
    expect(s.mask[1]).toBe(0);
    expect(s.cells[3]).toBe(7);
  });

  it('裁出的网格应继承色卡 id', () => {
    const g = createGrid(4, 4, 'hama');
    expect(sliceGrid(g, { index: 0, col: 0, row: 0, x0: 0, y0: 0, x1: 2, y1: 2 }).paletteId).toBe(
      'hama',
    );
  });
});
