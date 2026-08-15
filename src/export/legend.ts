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
const SWATCH = 16;
/** 色块与文字间距 */
const GAP = 6;
/** 图例标题高度 */
const TITLE_H = 26;

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
  ctx.fillStyle = '#333';
  ctx.font = '600 13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`图例 · 共 ${usages.length} 色`, originX, originY + TITLE_H / 2);
  // 标题分隔线
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
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

    // 色块
    ctx.fillStyle = u.bead.hex;
    ctx.fillRect(x, y, SWATCH, SWATCH);
    // 细边框，深底更清晰
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, SWATCH - 1, SWATCH - 1);

    // 文字（色号 + 数量）
    const label = `${u.bead.code} ×${u.count}`;

    ctx.fillStyle = '#444';
    ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + SWATCH + GAP, y + SWATCH / 2);
  }

  ctx.restore();
}