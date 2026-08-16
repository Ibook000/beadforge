/** 水印常量 —— 所见即所得：网站背景、PNG 导出、PDF 导出三处共用同一份水印文案。 */

// ===== 宏开关：设为 false 即可关闭所有导出水印 =====
export const ENABLE_WATERMARK = true;

export const WATERMARK = 'IBO0OK';
export const WATERMARK_FONT = '900 56px ui-monospace, "SF Mono", Menlo, monospace';
export const WATERMARK_COLOR = 'rgba(255, 90, 140, 0.2)';

/**
 * 在 canvas 上铺满旋转水印，覆盖在最上层，清晰可见。
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

  ctx.save();

  // 字号取画布短边的 60%（10倍于之前），保证铺满醒目
  const fontSize = Math.max(60, Math.min(width, height) * 0.6 * scale);
  ctx.font = `900 italic ${fontSize}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillStyle = WATERMARK_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 旋转 -18 度，在画布上铺满重复水印
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-18 * Math.PI / 180);

  // 铺满一整行（间距 2x 字号）
  const step = fontSize * 2.2;
  for (let y = -height; y < height * 1.5; y += step) {
    for (let x = -width; x < width * 1.5; x += step) {
      ctx.fillText(WATERMARK, x, y);
    }
  }

  ctx.restore();
}