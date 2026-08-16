/** 水印常量 —— 所见即所得：网站背景、PNG 导出、PDF 导出三处共用同一份水印文案。 */

// ===== 宏开关：设为 false 即可关闭所有导出水印 =====
export const ENABLE_WATERMARK = true;

export const WATERMARK = 'IBO0OK';
export const WATERMARK_FONT = '900 56px ui-monospace, \"SF Mono\", Menlo, monospace';
export const WATERMARK_COLOR = 'rgba(255, 90, 140, 0.8)';

/**
 * 在 canvas 中央画斜体旋转水印。
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
  if (!ENABLE_WATERMARK) return;

  const s = 42 * scale;
  ctx.save();

  // 移到画布中央，旋转 -18 度，画斜体水印
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-18 * Math.PI / 180);
  ctx.font = WATERMARK_FONT.replace('48px', `${s}px`);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = WATERMARK_COLOR;
  ctx.fillText(WATERMARK, 0, 0);

  ctx.restore();
}