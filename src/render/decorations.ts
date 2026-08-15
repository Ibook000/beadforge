import type { BeadGrid } from '../model/grid';
import { computeGeometry } from '../model/geometry';

export interface DecorOptions {
  cellSize: number;
  originX: number;
  originY: number;
  showGrid: boolean;
  showCoords: boolean;
  showBoardLines: boolean;
  showMajorLines: boolean;
  beadSizeMm: 5 | 2.6;
}

const GRID_COLOR = 'rgba(0,0,0,0.12)';
const MAJOR_COLOR = 'rgba(0,0,0,0.34)';
const BOARD_COLOR = 'rgba(217,74,92,0.7)';
const COORD_COLOR = '#5a5a66';

/** 网格线、每 10 格加粗辅助线、底板分界虚线、四边行列坐标 */
export function drawDecorations(
  ctx: CanvasRenderingContext2D,
  grid: BeadGrid,
  o: DecorOptions,
): void {
  const { cellSize: cs, originX: ox, originY: oy } = o;
  const w = grid.width * cs;
  const h = grid.height * cs;

  ctx.save();

  if (o.showGrid) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= grid.width; x++) {
      ctx.moveTo(ox + x * cs, oy);
      ctx.lineTo(ox + x * cs, oy + h);
    }
    for (let y = 0; y <= grid.height; y++) {
      ctx.moveTo(ox, oy + y * cs);
      ctx.lineTo(ox + w, oy + y * cs);
    }
    ctx.stroke();
  }

  if (o.showMajorLines) {
    ctx.strokeStyle = MAJOR_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= grid.width; x += 10) {
      ctx.moveTo(ox + x * cs, oy);
      ctx.lineTo(ox + x * cs, oy + h);
    }
    for (let y = 0; y <= grid.height; y += 10) {
      ctx.moveTo(ox, oy + y * cs);
      ctx.lineTo(ox + w, oy + y * cs);
    }
    ctx.stroke();
  }

  if (o.showBoardLines) {
    const pegs = computeGeometry(grid.width, grid.height, o.beadSizeMm).boardPegs;
    ctx.strokeStyle = BOARD_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let x = pegs; x < grid.width; x += pegs) {
      ctx.moveTo(ox + x * cs, oy);
      ctx.lineTo(ox + x * cs, oy + h);
    }
    for (let y = pegs; y < grid.height; y += pegs) {
      ctx.moveTo(ox, oy + y * cs);
      ctx.lineTo(ox + w, oy + y * cs);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (o.showCoords) {
    const fontSize = Math.max(8, Math.min(13, cs * 0.5));
    ctx.fillStyle = COORD_COLOR;
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'middle';

    // 格子太小时每 5 格标一个，避免数字糊成一片
    const step = cs < 14 ? 5 : 1;
    const wanted = (n: number) => n === 0 || (n + 1) % step === 0;

    ctx.textAlign = 'center';
    for (let x = 0; x < grid.width; x++) {
      if (!wanted(x)) continue;
      const cx = ox + x * cs + cs / 2;
      ctx.fillText(String(x + 1), cx, oy - fontSize * 0.8);
      ctx.fillText(String(x + 1), cx, oy + h + fontSize * 0.8);
    }

    for (let y = 0; y < grid.height; y++) {
      if (!wanted(y)) continue;
      const cy = oy + y * cs + cs / 2;
      ctx.textAlign = 'right';
      ctx.fillText(String(y + 1), ox - 4, cy);
      ctx.textAlign = 'left';
      ctx.fillText(String(y + 1), ox + w + 4, cy);
    }
  }

  ctx.restore();
}
