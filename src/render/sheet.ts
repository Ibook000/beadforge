import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { luma, type RGB } from '../color/space';
import { assignSymbols } from '../palette/symbols';
import { drawDecorations } from './decorations';

export type SheetStyle = 'code' | 'symbol' | 'plain' | 'round';

export interface SheetOptions {
  style: SheetStyle;
  /** 每格边长，像素 */
  cellSize: number;
  showGrid: boolean;
  showCoords: boolean;
  showBoardLines: boolean;
  showMajorLines: boolean;
  beadSizeMm: 5 | 2.6;
  /** 空格的背景色。传 null 表示不画（导出透明 PNG 时用） */
  emptyColor: string | null;
}

export const DEFAULT_SHEET_OPTIONS: SheetOptions = {
  style: 'code',
  cellSize: 24,
  showGrid: true,
  showCoords: true,
  showBoardLines: false,
  showMajorLines: true,
  beadSizeMm: 5,
  emptyColor: '#F6F6FA',
};

/**
 * 图纸绘制的附加选项 —— 对话高亮（拼图模式）。
 *
 * 用法：highlightIndex 非 null 时：
 *  - 与 highlightIndex 同色的格子保持原样并叠加脉冲呼吸罩（淡粉）
 *  - 其它有豆格子变淡（白色罩）
 */
export interface SheetHighlight {
  /** 当前高亮的豆号下标；null = 不高亮 */
  index: number | null;
  /** 脉冲相位 0–2π，每秒推进，用于呼吸动画透明度 */
  pulsePhase: number;
}

/** 同色格子的呼吸高亮色（淡粉） */
const HIGHLIGHT_TINT = 'rgba(255, 143, 176,';
/** 其它格子的变淡白色罩 */
const DIMMED_TINT = 'rgba(255, 255, 255, 0.6)';

/** 浅底取黑字、深底取白字。0.55 是实测下来对拼豆色卡最舒服的分界。 */
export function inkColor(rgb: RGB): string {
  return luma(rgb) > 0.55 ? '#111111' : '#FFFFFF';
}

export function sheetPixelSize(
  grid: BeadGrid,
  opts: SheetOptions,
): { width: number; height: number; originX: number; originY: number } {
  const margin = opts.showCoords ? Math.max(20, opts.cellSize * 1.2) : 0;
  return {
    width: grid.width * opts.cellSize + margin * 2,
    height: grid.height * opts.cellSize + margin * 2,
    originX: margin,
    originY: margin,
  };
}

/**
 * 色号字号：按本张图纸**实际用到**的最长色号来定，保证塞得进格子。
 *
 * 不同色卡的色号长度差很多 —— MARD 是 `F5`（2 字符），
 * Perler 是 `80-15179`（8 字符）。用固定比例的字号会让 Perler 的色号
 * 直接溢出格子糊成一团。等宽字体每字符约 0.6em，据此反推。
 */
export function codeFontSize(
  cellSize: number,
  usedBeads: readonly number[],
  palette: Palette,
): number {
  let maxLen = 2;
  for (const i of usedBeads) {
    const len = palette.beads[i]?.code.length ?? 2;
    if (len > maxLen) maxLen = len;
  }
  // 留 12% 内边距，等宽字符宽 ≈ 0.6em
  const fitWidth = (cellSize * 0.88) / (maxLen * 0.6);
  return Math.max(4, Math.min(cellSize * 0.42, fitWidth));
}

/** 收集图纸里实际用到的豆号 */
export function usedBeadIndices(grid: BeadGrid): number[] {
  const set = new Set<number>();
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.mask[i] === 1) set.add(grid.cells[i]!);
  }
  return [...set];
}

export function drawSheet(
  ctx: CanvasRenderingContext2D,
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  highlight?: SheetHighlight | null,
): void {
  const { originX: ox, originY: oy } = sheetPixelSize(grid, opts);
  const cs = opts.cellSize;

  const used = opts.style === 'symbol' || opts.style === 'code' ? usedBeadIndices(grid) : [];

  // 拼图高亮：呼吸透明度（仅在需要高亮时计算）
  const breathe =
    highlight && highlight.index != null
      ? 0.28 + 0.22 * (1 + Math.sin(highlight.pulsePhase)) / 2
      : 0;
  const highlightIndex = highlight?.index ?? null;

  // symbol 样式按本张图纸实际用色分配符号（只需保证这几种之间可辨）
  const symbols = opts.style === 'symbol' ? assignSymbols(used) : null;

  const fontSize =
    opts.style === 'symbol'
      ? Math.max(7, cs * 0.55)
      : codeFontSize(cs, used, palette);
  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const i = y * grid.width + x;
      const px = ox + x * cs;
      const py = oy + y * cs;

      if (grid.mask[i] !== 1) {
        if (opts.emptyColor !== null) {
          ctx.fillStyle = opts.emptyColor;
          ctx.fillRect(px, py, cs, cs);
        }
        continue;
      }

      const bead = palette.beads[grid.cells[i]!]!;

      if (opts.style === 'round') {
        if (opts.emptyColor !== null) {
          ctx.fillStyle = opts.emptyColor;
          ctx.fillRect(px, py, cs, cs);
        }
        const cx = px + cs / 2;
        const cy = py + cs / 2;
        ctx.fillStyle = bead.hex;
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.46, 0, Math.PI * 2);
        ctx.fill();
        // 中间的孔
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.16, 0, Math.PI * 2);
        ctx.fill();
        // 拼图高亮叠加：同色呼吸、异色变淡
        if (highlightIndex != null) {
          if (grid.cells[i] === highlightIndex) {
            ctx.fillStyle = `${HIGHLIGHT_TINT} ${breathe})`;
            ctx.beginPath();
            ctx.arc(cx, cy, cs * 0.46, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = DIMMED_TINT;
            ctx.fillRect(px, py, cs, cs);
          }
        }
        continue;
      }

      ctx.fillStyle = bead.hex;
      ctx.fillRect(px, py, cs, cs);

      if (opts.style === 'plain') continue;

      const label = opts.style === 'symbol' ? symbols!.get(grid.cells[i]!)! : bead.code;
      ctx.fillStyle = inkColor(bead.rgb);
      ctx.fillText(label, px + cs / 2, py + cs / 2 + fontSize * 0.05);

      // 拼图高亮叠加：同色呼吸、异色变淡
      if (highlightIndex != null) {
        if (grid.cells[i] === highlightIndex) {
          ctx.fillStyle = `${HIGHLIGHT_TINT} ${breathe})`;
          ctx.fillRect(px, py, cs, cs);
        } else {
          ctx.fillStyle = DIMMED_TINT;
          ctx.fillRect(px, py, cs, cs);
        }
      }
    }
  }

  drawDecorations(ctx, grid, {
    cellSize: cs,
    originX: ox,
    originY: oy,
    showGrid: opts.showGrid,
    showCoords: opts.showCoords,
    showBoardLines: opts.showBoardLines,
    showMajorLines: opts.showMajorLines,
    beadSizeMm: opts.beadSizeMm,
  });
}
