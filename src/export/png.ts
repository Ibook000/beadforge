import type { BeadGrid } from '../model/grid';
import type { Palette } from '../palette/types';
import { drawSheet, sheetPixelSize, type SheetOptions, type SheetStyle } from '../render/sheet';
import { computeStats, type GridStats } from '../model/stats';
import { drawLegendFromStats, legendAreaHeight, type LegendOptions } from './legend';
import { drawWatermark, shouldWatermark, SITE_URL, CONTACT, ensureFontsReady } from './watermark';
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
const INFO_HEADER_H = 120;
const INFO_PAD = 20;

/**
 * 在画布顶部画信息头：网站、联系方式，以及网格尺寸 / 色卡名 / 豆子总数 / 颜色数。
 *
 * 排版：左侧品牌区（网站名 + 联系方式），右侧四宫格统计卡
 * （每格一个暖色圆点 + 标签 + 数值）。信息头是导出图的「名片」。
 */
function drawInfoHeader(
  ctx: CanvasRenderingContext2D,
  grid: BeadGrid,
  palette: Palette,
  stats: GridStats,
  width: number,
): void {
  ctx.save();

  // 顶部品牌彩条（暖棕色渐变）
  const bar = ctx.createLinearGradient(0, 0, width, 0);
  bar.addColorStop(0, '#c9a06c');
  bar.addColorStop(1, '#d4b896');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, width, 8);

  // ---- 左侧：网站名 + 联系方式 ----
  const leftX = INFO_PAD;
  const topY = INFO_PAD + 4;

  ctx.fillStyle = '#2c2c2c';
  ctx.font = '700 32px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('拼豆图纸', leftX, topY);

  ctx.fillStyle = '#888888';
  ctx.font = '500 16px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(SITE_URL, leftX, topY + 42);

  ctx.fillStyle = '#aaaaaa';
  ctx.font = '400 14px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`作者 @ ${CONTACT}`, leftX, topY + 66);

  // ---- 右侧：四宫格统计卡 ----
  const cards = [
    { label: '网格', value: `${grid.width} × ${grid.height}`, color: '#c9a06c' },
    { label: '色卡', value: palette.label, color: '#8fa68a' },
    { label: '豆子', value: `${stats.totalBeads} 颗`, color: '#b8976e' },
    { label: '颜色', value: `${stats.colorCount} 种`, color: '#7a9a8a' },
  ];

  const cardW = 168;
  const cardH = 44;
  const cardGap = 12;
  const cardsBlockW = cardW * 2 + cardGap;
  const cardsBlockH = cardH * 2 + cardGap;
  const cardsX = width - INFO_PAD - cardsBlockW;
  const cardsY = topY + 8;

  ctx.font = '700 22px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textBaseline = 'middle';

  cards.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = cardsX + col * (cardW + cardGap);
    const y = cardsY + row * (cardH + cardGap);

    // 卡片底色（暖米色圆角）
    roundedRect(ctx, x, y, cardW, cardH, 10);
    ctx.fillStyle = '#f5f0e8';
    ctx.fill();

    // 左侧圆点
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x + 18, y + cardH / 2, 7, 0, Math.PI * 2);
    ctx.fill();

    // 标签（小字灰）
    ctx.fillStyle = '#888888';
    ctx.font = '500 15px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(c.label, x + 34, y + cardH / 2 - 9);

    // 数值（大字深色）
    ctx.fillStyle = '#2c2c2c';
    ctx.font = '700 19px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(c.value, x + 34, y + cardH / 2 + 11);
  });

  ctx.restore();
}

/** 画圆角矩形路径（不填充，由调用方 fill/stroke） */
function roundedRect(
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
  watermark = shouldWatermark(),
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

  // 3. 水印（覆盖在最上层；watermark 由调用方根据激活状态决定）
  if (watermark) {
    drawWatermark(ctx, canvas.width, canvas.height, 1);
  }

  return canvas;
}

export async function exportSheetPng(
  grid: BeadGrid,
  palette: Palette,
  opts: SheetOptions,
  filename: string,
): Promise<void> {
  // 先确认激活状态（未激活 → 本次导出带水印），再等字体
  const watermark = await shouldWatermark();
  await ensureFontsReady();
  const effective: SheetOptions = { ...opts, cellSize: exportCellSize(grid, opts.style) };
  const canvas = renderSheetToCanvas(grid, palette, effective, EXPORT_LEGEND, watermark);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG 导出失败：canvas.toBlob 返回空');
  downloadBlob(filename, blob);
}