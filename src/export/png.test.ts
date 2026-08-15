import { describe, it, expect } from 'vitest';
import { exportCellSize } from './png';
import { createGrid } from '../model/grid';

describe('exportCellSize', () => {
  it('小图应给足够大的格宽让色号看得清', () => {
    const g = createGrid(29, 29, 'mard');
    expect(exportCellSize(g, 'code')).toBeGreaterThanOrEqual(24);
  });

  it('大图应缩小格宽以免超出 canvas 像素上限', () => {
    const g = createGrid(200, 200, 'mard');
    const cs = exportCellSize(g, 'code', 16_000_000);
    expect((200 * cs) ** 2).toBeLessThanOrEqual(16_000_000);
  });

  it('plain 样式不需要放字，可以用更小的格宽', () => {
    const g = createGrid(100, 100, 'mard');
    expect(exportCellSize(g, 'plain')).toBeLessThanOrEqual(exportCellSize(g, 'code'));
  });

  it('结果永远是 ≥ 1 的整数', () => {
    const g = createGrid(200, 200, 'mard');
    const cs = exportCellSize(g, 'code', 1000);
    expect(Number.isInteger(cs)).toBe(true);
    expect(cs).toBeGreaterThanOrEqual(1);
  });

  it('小图不应因为像素预算充裕就放大到荒谬的格宽', () => {
    expect(exportCellSize(createGrid(5, 5, 'mard'), 'code')).toBe(32);
  });
});
