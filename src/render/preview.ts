import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { drawSheet, sheetPixelSize, type SheetHighlight, type SheetOptions } from './sheet';

export interface Preview {
  render(
    grid: BeadGrid,
    palette: Palette,
    opts: SheetOptions,
    highlight?: SheetHighlight | null,
  ): void;
  /** 屏幕坐标 → 格子坐标，落在图外返回 null */
  cellAt(clientX: number, clientY: number): { x: number; y: number } | null;
}

/**
 * 屏幕预览。
 *
 * 格宽由可用空间自动决定，不由 opts.cellSize 决定 —— 这样用户拖颗粒度
 * 滑块时画布尺寸保持稳定，不会一会儿撑满一会儿缩成一团。
 * 导出走 export/png.ts 的离屏 canvas，分辨率独立可控。
 */
export function createPreview(canvas: HTMLCanvasElement, stage: HTMLElement): Preview {
  let lastGrid: BeadGrid | null = null;
  let lastCellSize = 1;
  let lastOrigin = { x: 0, y: 0 };

  /** 当前画布实际所在容器的尺寸（全屏时是 fs-canvas-area，普通模式是 stage） */
  function containerSize(): { w: number; h: number } {
    // 向上查找 .fs-canvas-area 或回到 stage
    let el: HTMLElement | null = canvas.parentElement;
    while (el) {
      if (el.classList.contains('fs-canvas-area') || el.id === 'stage') break;
      el = el.parentElement;
    }
    el = el || stage;
    const w = el.clientWidth;
    const h = el.clientHeight;
    return { w: Math.max(80, w), h: Math.max(80, h) };
  }

  return {
    render(grid, palette, opts, highlight) {
      const { w: availW0, h: availH0 } = containerSize();
      const pad = 28;
      const availW = Math.max(80, availW0 - pad * 2);
      const availH = Math.max(80, availH0 - pad * 2);
      // showCoords 会在四边各留 1.2 格的边距
      const marginCells = opts.showCoords ? 2.4 : 0;
      const cellSize = Math.max(
        2,
        Math.floor(
          Math.min(availW / (grid.width + marginCells), availH / (grid.height + marginCells)),
        ),
      );

      const effective: SheetOptions = { ...opts, cellSize };
      const size = sheetPixelSize(grid, effective);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.width, size.height);
      drawSheet(ctx, grid, palette, effective, highlight);

      lastGrid = grid;
      lastCellSize = cellSize;
      lastOrigin = { x: size.originX, y: size.originY };
    },

    cellAt(clientX, clientY) {
      if (!lastGrid) return null;
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((clientX - r.left - lastOrigin.x) / lastCellSize);
      const y = Math.floor((clientY - r.top - lastOrigin.y) / lastCellSize);
      if (x < 0 || y < 0 || x >= lastGrid.width || y >= lastGrid.height) return null;
      return { x, y };
    },
  };
}