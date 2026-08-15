import type { PaletteId } from '../palette/types';

/**
 * 图纸的唯一真相。
 *
 * cells 用 Uint16Array 因为最大色卡 291 色，超出 Uint8Array 上限。
 * mask 为 0 的格子表示不放豆（透明或背景），此时 cells 的值无意义 ——
 * 所有消费方（统计、渲染、导出）必须先查 mask。
 */
export interface BeadGrid {
  width: number;
  height: number;
  paletteId: PaletteId;
  /** 长度 width*height，行主序，值为色卡 beads 数组的下标 */
  cells: Uint16Array;
  /** 长度 width*height，1 = 放豆，0 = 空格 */
  mask: Uint8Array;
}

export function createGrid(width: number, height: number, paletteId: PaletteId): BeadGrid {
  const n = width * height;
  return { width, height, paletteId, cells: new Uint16Array(n), mask: new Uint8Array(n) };
}

export function cloneGrid(g: BeadGrid): BeadGrid {
  return {
    width: g.width,
    height: g.height,
    paletteId: g.paletteId,
    cells: new Uint16Array(g.cells),
    mask: new Uint8Array(g.mask),
  };
}

export function idx(g: BeadGrid, x: number, y: number): number {
  return y * g.width + x;
}

export function inBounds(g: BeadGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function getCell(g: BeadGrid, x: number, y: number): number {
  return g.cells[idx(g, x, y)]!;
}

/** 写入一格并置位 mask */
export function setCell(g: BeadGrid, x: number, y: number, beadIndex: number): void {
  const i = idx(g, x, y);
  g.cells[i] = beadIndex;
  g.mask[i] = 1;
}

/** 把一格置为空（不放豆） */
export function clearCell(g: BeadGrid, x: number, y: number): void {
  g.mask[idx(g, x, y)] = 0;
}

export function isFilled(g: BeadGrid, x: number, y: number): boolean {
  return g.mask[idx(g, x, y)] === 1;
}

/** 非空格的数量 —— 也就是实际需要的豆子颗数 */
export function countFilled(g: BeadGrid): number {
  let n = 0;
  for (let i = 0; i < g.mask.length; i++) n += g.mask[i]!;
  return n;
}
