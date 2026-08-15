/** 水印常量 —— 所见即所得：网站背景、PNG 导出、PDF 导出三处共用同一份水印文案。 */
export const WATERMARK = 'IBO0OK';
export const WATERMARK_FONT =
  '600 20px ui-monospace, SFMono-Regular, Menlo, monospace';
export const WATERMARK_COLOR = 'rgba(200, 120, 160, 0.18)';

/**
 * 在 canvas 右下角绘制水印。
 * @param ctx      目标 canvas 上下文
 * @param width    canvas 像素宽
 * @param height   canvas 像素高
 * @param scale    水印缩放（导出图通常更大，可放大水印）
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale = 1,
): void {
  const s = 28 * scale;
  ctx.save();
  ctx.font = `700 ${s}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = WATERMARK_COLOR;
  // 置于右下角，留 24px 边距
  ctx.fillText(WATERMARK, width - 24 * scale, height - 18 * scale);
  ctx.restore();
}