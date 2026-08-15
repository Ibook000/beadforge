import { describe, it, expect } from 'vitest';
import {
  sheetPixelSize,
  drawSheet,
  inkColor,
  usedBeadIndices,
  DEFAULT_SHEET_OPTIONS,
} from './sheet';
import { createGrid, setCell, clearCell } from '../model/grid';
import { getPalette } from '../palette/registry';

/** 记录调用的假 ctx —— Canvas 在 Node 下不可用，只验证调用序列 */
function mockCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  const ctx = {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    fillText: rec('fillText'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    stroke: rec('stroke'),
    arc: rec('arc'),
    fill: rec('fill'),
    save: rec('save'),
    restore: rec('restore'),
    setLineDash: rec('setLineDash'),
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

const texts = (ctx: ReturnType<typeof mockCtx>) =>
  ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);

describe('sheetPixelSize', () => {
  it('不显示坐标时尺寸就是格数 × 格宽', () => {
    const g = createGrid(10, 6, 'mard');
    const s = sheetPixelSize(g, { ...DEFAULT_SHEET_OPTIONS, cellSize: 20, showCoords: false });
    expect(s.width).toBe(200);
    expect(s.height).toBe(120);
    expect(s.originX).toBe(0);
    expect(s.originY).toBe(0);
  });

  it('显示坐标时四边应留出边距', () => {
    const g = createGrid(10, 6, 'mard');
    const s = sheetPixelSize(g, { ...DEFAULT_SHEET_OPTIONS, cellSize: 20, showCoords: true });
    expect(s.originX).toBeGreaterThan(0);
    expect(s.width).toBeGreaterThan(200);
    // 左右边距应对称
    expect(s.width - 200 - s.originX).toBe(s.originX);
  });
});

describe('inkColor', () => {
  it('浅底取黑字，深底取白字', () => {
    expect(inkColor([255, 255, 255])).toBe('#111111');
    expect(inkColor([0, 0, 0])).toBe('#FFFFFF');
    expect(inkColor([252, 40, 60])).toBe('#FFFFFF');
    expect(inkColor([245, 236, 210])).toBe('#111111');
  });
});

describe('usedBeadIndices', () => {
  it('只统计非空格，且去重', () => {
    const g = createGrid(3, 1, 'mard');
    setCell(g, 0, 0, 7);
    setCell(g, 1, 0, 7);
    g.cells[2] = 99; // 脏值但 mask=0
    expect(usedBeadIndices(g).sort()).toEqual([7]);
  });
});

describe('drawSheet', () => {
  const palette = getPalette('mard');

  it('code 样式应为每个非空格写出色号', () => {
    const g = createGrid(2, 1, 'mard');
    setCell(g, 0, 0, 0);
    clearCell(g, 1, 0);

    const ctx = mockCtx();
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'code', showCoords: false });
    expect(texts(ctx)).toEqual([palette.beads[0]!.code]);
  });

  it('plain 样式不应写任何文字', () => {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 0, 0, 0);
    setCell(g, 1, 1, 1);

    const ctx = mockCtx();
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'plain', showCoords: false });
    expect(ctx.calls.some((c) => c.op === 'fillText')).toBe(false);
  });

  it('round 样式应用 arc 画圆', () => {
    const g = createGrid(1, 1, 'mard');
    setCell(g, 0, 0, 0);

    const ctx = mockCtx();
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'round', showCoords: false });
    expect(ctx.calls.filter((c) => c.op === 'arc')).toHaveLength(2); // 豆身 + 中间的孔
  });

  it('symbol 样式写出的应是符号而不是色号', () => {
    const g = createGrid(1, 1, 'mard');
    setCell(g, 0, 0, 0);

    const ctx = mockCtx();
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'symbol', showCoords: false });
    const t = texts(ctx);
    expect(t).toHaveLength(1);
    expect(t[0]).not.toBe(palette.beads[0]!.code);
  });

  it('symbol 样式下同色格子应拿到同一个符号', () => {
    const g = createGrid(3, 1, 'mard');
    setCell(g, 0, 0, 5);
    setCell(g, 1, 0, 9);
    setCell(g, 2, 0, 5);

    const ctx = mockCtx();
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'symbol', showCoords: false });
    const t = texts(ctx);
    expect(t[0]).toBe(t[2]);
    expect(t[0]).not.toBe(t[1]);
  });

  it('showCoords 时应画出行列数字', () => {
    const g = createGrid(2, 2, 'mard');
    setCell(g, 0, 0, 0);

    const ctx = mockCtx();
    drawSheet(ctx, g, palette, { ...DEFAULT_SHEET_OPTIONS, style: 'plain', showCoords: true });
    expect(texts(ctx)).toContain('1');
    expect(texts(ctx)).toContain('2');
  });

  it('底板分界线关闭时不应产生虚线', () => {
    const g = createGrid(60, 60, 'mard');
    const ctx = mockCtx();
    drawSheet(ctx, g, palette, {
      ...DEFAULT_SHEET_OPTIONS,
      style: 'plain',
      showCoords: false,
      showBoardLines: false,
    });
    expect(ctx.calls.some((c) => c.op === 'setLineDash')).toBe(false);
  });

  it('全空网格不应崩', () => {
    const ctx = mockCtx();
    expect(() =>
      drawSheet(ctx, createGrid(3, 3, 'mard'), palette, DEFAULT_SHEET_OPTIONS),
    ).not.toThrow();
  });
});
