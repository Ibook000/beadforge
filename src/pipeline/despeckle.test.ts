import { describe, it, expect } from 'vitest';
import { despeckle } from './despeckle';
import { createGrid, setCell, getCell, clearCell, type BeadGrid } from '../model/grid';

/** 用二维数组建网格，-1 表示空格 */
function build(rows: number[][]): BeadGrid {
  const g = createGrid(rows[0]!.length, rows.length, 'mard');
  rows.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v < 0) clearCell(g, x, y);
      else setCell(g, x, y, v);
    }),
  );
  return g;
}

function dump(g: BeadGrid): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < g.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < g.width; x++) {
      row.push(g.mask[y * g.width + x] === 1 ? getCell(g, x, y) : -1);
    }
    out.push(row);
  }
  return out;
}

describe('despeckle', () => {
  it('off 应原样返回', () => {
    const rows = [
      [0, 0, 0],
      [0, 5, 0],
      [0, 0, 0],
    ];
    expect(dump(despeckle(build(rows), 'off'))).toEqual(rows);
  });

  it('weak 应清掉完全孤立的单颗', () => {
    const g = build([
      [0, 0, 0],
      [0, 5, 0],
      [0, 0, 0],
    ]);
    expect(dump(despeckle(g, 'weak'))).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('weak 不应误伤成片色块', () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 7, 7, 0],
      [0, 7, 7, 0],
      [0, 0, 0, 0],
    ];
    expect(dump(despeckle(build(rows), 'weak'))).toEqual(rows);
  });

  it('weak 保留孤立的对子，strong 清掉', () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 9, 9, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    // 对子里每颗在自己的 3×3 窗口内都能看到同伴，计数为 2 > weak 的阈值 1
    expect(dump(despeckle(build(rows), 'weak'))).toEqual(rows);
    expect(dump(despeckle(build(rows), 'strong'))).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('空格不应被填充', () => {
    const g = build([
      [0, 0, 0],
      [0, -1, 0],
      [0, 0, 0],
    ]);
    expect(dump(despeckle(g, 'strong'))[1]![1]).toBe(-1);
  });

  it('不应修改输入网格', () => {
    const g = build([
      [0, 0, 0],
      [0, 5, 0],
      [0, 0, 0],
    ]);
    despeckle(g, 'weak');
    expect(getCell(g, 1, 1)).toBe(5);
  });

  it('全部同色时应原样返回', () => {
    const rows = [
      [3, 3],
      [3, 3],
    ];
    expect(dump(despeckle(build(rows), 'strong'))).toEqual(rows);
  });

  it('结果应与扫描顺序无关：两个相邻孤点互不影响判定', () => {
    // 中间两个孤点各自为战，都应被清掉，而不是先清一个再让另一个"合群"
    const g = build([
      [0, 0, 0, 0],
      [0, 5, 6, 0],
      [0, 0, 0, 0],
    ]);
    const out = dump(despeckle(g, 'weak'));
    expect(out[1]![1]).toBe(0);
    expect(out[1]![2]).toBe(0);
  });
});
