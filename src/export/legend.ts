import type { BeadGrid } from '../model/grid';
import type { GridStats } from '../model/stats';
import type { Palette } from '../palette/types';
import { computeStats } from '../model/stats';

/**
 * 图例布局样式。
 * - grid：色块 + 色号 + 数量，网格排列（传统拼豆图纸样式）
 * - list：色块 + 色号 + 中文名，单列排列（采购清单样式）
 */
export type LegendStyle = 'grid' | 'list';

export interface LegendOptions {
  style: LegendStyle;
  /** 每行几个色块（grid 样式） */
  cols: number;
  /** 一个图例项（色块+文字）的高度，像素 */
  itemHeight: number;
}

export const DEFAULT_LEGEND_OPTIONS: LegendOptions = {
  style: 'grid',
  cols: 5,
  itemHeight: 28,
};

/** 色块边长，像素 */
const SWATCH = 48;
/** 色块与文字间距 */
const GAP = 16;
/** 图例标题高度 */
const TITLE_H = 52;

/** 图例区域总高度（标题 + 行数 × 行高） */
export function legendAreaHeight(
  colorCount: number,
  opts: LegendOptions,
): number {
  const rows = Math.ceil(colorCount / opts.cols);
  return TITLE_H + rows * opts.itemHeight;
}

/**
 * 在图纸下方绘制图例。
 *
 * @param ctx     已画完图纸的上下文（画布已设好总尺寸）
 * @param grid    图纸数据
 * @param palette 色卡
 * @param legend  图例选项
 * @param originX 图例区域左上角 x
 * @param originY 图例区域左上角 y
 * @param areaW   图例区域宽度
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  grid: BeadGrid,
  palette: Palette,
  legend: LegendOptions,
  originX: number,
  originY: number,
  areaW: number,
): void {
  const stats = computeStats(grid, palette);
  drawLegendFromStats(ctx, stats, palette, legend, originX, originY, areaW);
}

/** 从已算好的 stats 画图例，避免重复计算 */
export function drawLegendFromStats(
  ctx: CanvasRenderingContext2D,
  stats: GridStats,
  palette: Palette,
  legend: LegendOptions,
  originX: number,
  originY: number,
  areaW: number,
): void {
  const { usages } = stats;
  ctx.save();

  // 标题
  ctx.fillStyle = '#2c2c2c';
  ctx.font = '700 26px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`图例 · 共 ${usages.length} 色`, originX, originY + TITLE_H / 2);
  // 标题分隔线（暖棕色渐变）
  const sep = ctx.createLinearGradient(originX, 0, originX + areaW, 0);
  sep.addColorStop(0, '#c9a06c');
  sep.addColorStop(1, 'rgba(201,160,108,0.1)');
  ctx.strokeStyle = sep;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originX, originY + TITLE_H - 2);
  ctx.lineTo(originX + areaW, originY + TITLE_H - 2);
  ctx.stroke();

  const xs = legend.style === 'grid' ? legend.cols : 1;
  const ys = Math.ceil(usages.length / xs);

  // 每列宽（grid：等分；list：占满整行）
  const colW = xs === 1 ? areaW : Math.floor(areaW / xs);

  for (let i = 0; i < usages.length; i++) {
    const u = usages[i]!;
    const col = i % xs;
    const row = Math.floor(i / xs);
    const x = originX + col * colW;
    const y = originY + TITLE_H + row * legend.itemHeight;

    // 色块（圆角，更柔和）
    ctx.fillStyle = u.bead.hex;
    roundedSwatch(ctx, x, y, SWATCH, SWATCH, 8);
    ctx.fill();
    // 细边框，深底更清晰
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    roundedSwatch(ctx, x + 0.5, y + 0.5, SWATCH - 1, SWATCH - 1, 7.5);
    ctx.stroke();

    // 色号（粗体等宽）
    ctx.fillStyle = '#2c2c2c';
    ctx.font = '700 22px "SFMono-Regular", ui-monospace, Menlo, "Cascadia Code", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.bead.code, x + SWATCH + GAP, y + SWATCH / 2 - 10);

    // 数量（小字灰，放色号下方）
    ctx.fillStyle = '#888888';
    ctx.font = '500 16px "Noto Sans SC", "PingFang SC", sans-serif';
    ctx.fillText(`× ${u.count} 颗`, x + SWATCH + GAP, y + SWATCH / 2 + 12);
  }

  ctx.restore();
}

/** 圆角色块路径 */
function roundedSwatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}