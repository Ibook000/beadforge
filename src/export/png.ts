import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { drawSheet, sheetPixelSize, type SheetOptions, type SheetStyle } from '../render/sheet';
import { computeStats, type GridStats } from '../model/stats';
import { drawLegendFromStats, legendAreaHeight, type LegendOptions } from './legend';
import { drawWatermark, ENABLE_WATERMARK, SITE_URL, CONTACT } from './watermark';
import { downloadBlob } from './csv';

/** 浏览器 canvas 上限因平台而异，1600 万像素是各家都吃得下的保守值 */
const DEFAULT_MAX_PIXELS = 16_000_000;

/**
 * 决定导出时每格多少像素。
 *
 * code/symbol 样式要放得下文字，理想格宽更大；plain/round 无文字可以小一些。
 * 大图会撞到 canvas 像素上限，此时按面积等比缩小。
 */
export function exportCellSize(
  grid: BeadGrid,
  style: SheetStyle,
  maxPixels = DEFAULT_MAX_PIXELS,
): number {
  const ideal = style === 'code' || style === 'symbol' ? 32 : 16;
  const cells = grid.width * grid.height;
  const capped = Math.floor(Math.sqrt(maxPixels / cells));
  return Math.max(1, Math.min(ideal, capped));
}

/** 导出所需的图例选项 */
const EXPORT_LEGEND: LegendOptions = {
  style: 'grid',
  cols: 4,
  itemHeight: 60,
};

/** 信息头高度（画布顶部预留区域，放网站/联系方式/网格/色卡/豆数/色数） */
const INFO_HEADER_H = 92;
const INFO_PAD = 16;

/**
 * 在画布左上角画信息头：网站、联系方式，以及网格尺寸 / 色卡名 / 豆子总数 / 颜色数。
 *
 * 信息头是导出图的「名片」，方便别人拿到图纸后回网站找同款或联系作者。
 */
function drawInfoHeader(
  ctx: CanvasRenderingContext2D,
  grid: BeadGrid,
  palette: Palette,
  stats: GridStats,
  width: number,
): void {
  ctx.save();

  // 顶部粉色彩条（品牌色）
  ctx.fillStyle = '#ff8fb0';
  ctx.fillRect(0, 0, width, 6);

  // 网站名（大号）
  ctx.fillStyle = '#ff5a8c';
  ctx.font = '900 30px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(SITE_URL, INFO_PAD, INFO_PAD);

  // 联系方式
  ctx.fillStyle = '#888';
  ctx.font = '600 20px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText(`@ ${CONTACT}`, INFO_PAD, INFO_PAD + 36);

  // 右侧统计：网格 / 色卡 / 豆子总数 / 颜色数
  ctx.textAlign = 'right';
  ctx.fillStyle = '#333';
  ctx.font = '700 22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  const lines = [
    `网格 ${grid.width} × ${grid.height}`,
    `色卡 ${palette.label}`,
    `豆子 ${stats.totalBeads} 颗`,
    `颜色 ${stats.colorCount} 种`,
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, width - INFO_PAD, INFO_PAD + i * 22);
  });

  ctx.restore();
}

/**
 * 用离屏 canvas 渲染图纸（含图例 + 水印）。
 *
 * 不复用屏幕预览的 canvas —— 预览有 DPR 缩放和自适应格宽，
 * 直接复用会让导出分辨率随显示器变化（Retina 和普通屏导出尺寸不一样）。
 */
export function renderSheetToCanvas(
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  legendOpts?: LegendOptions,
): HTMLCanvasElement {
  const size = sheetPixelSize(grid, opts);
  const stats = computeStats(grid, palette);

  // 顶部信息头高度 + 16px 间距
  const headerH = INFO_HEADER_H + 16;
  // 额外空间：图例高度 + 16px 间距
  const legendHeight = legendOpts ? legendAreaHeight(stats.colorCount, legendOpts) + 16 : 0;

  // 图例宽度 = 图纸宽度，两边留 8px
  const legendW = Math.max(1, size.width - 16);
  const legendMargin = 8;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height + headerH + legendHeight));

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. 顶部信息头（网站 + 联系方式 + 网格/色卡/豆数/色数）
  drawInfoHeader(ctx, grid, palette, stats, canvas.width);

  // 2. 图纸主体（下移 headerH）
  ctx.save();
  ctx.translate(0, headerH);
  drawSheet(ctx, grid, palette, opts);
  ctx.restore();

  if (legendOpts) {
    drawLegendFromStats(
      ctx,
      stats,
      palette,
      legendOpts,
      legendMargin,
      headerH + size.height + 16,
      legendW,
    );
  }

  // 3. 水印（覆盖在最上层，已由 ENABLE_WATERMARK 宏控制）
  drawWatermark(ctx, canvas.width, canvas.height, 1);

  return canvas;
}

export async function exportSheetPng(
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  filename: string,
): Promise<void> {
  const effective: SheetOptions = { ...opts, cellSize: exportCellSize(grid, opts.style) };
  const canvas = renderSheetToCanvas(grid, palette, effective, EXPORT_LEGEND);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG 导出失败：canvas.toBlob 返回空');
  downloadBlob(filename, blob);
}