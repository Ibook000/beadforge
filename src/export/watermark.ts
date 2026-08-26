/** 水印常量 —— 所见即所得：网站背景、PNG 导出、PDF 导出三处共用同一份水印文案。 */

// ===== 运行时开关 =====
// 原来是个编译期宏（ENABLE_WATERMARK），现在改为按激活状态动态决定：
// 已激活（付费解锁）不画水印，未激活画水印。见 src/auth/activation.ts。
import { isActivated } from '../auth/activation';

export const WATERMARK = 'IBO0OK';
export const WATERMARK_FONT = '900 56px ui-monospace, "SF Mono", Menlo, monospace';
/** 黑色水印 —— 透明度 18%，清晰可见但不喧宾夺主 */
export const WATERMARK_COLOR = 'rgba(0, 0, 0, 0.18)';

/** 导出左上角信息头里的网站与联系方式 */
export const SITE_URL = 'https://ibook000.github.io/beadforge/';
export const CONTACT = 'IBO0OK';

/**
 * 当前是否应该画水印（运行时）：已激活 → 不画；未激活 → 画。
 * 导出层在调用 drawWatermark 之前先问这个。
 */
export function shouldWatermark(): boolean {
  return !isActivated();
}

/**
 * 等待网页字体加载完成，确保导出 canvas 用对字体而非 fallback。
 *
 * document.fonts.ready 在所有 @font-face（含 Google Fonts 链接）就绪时 resolve；
 * 超时则放弃等待，用 fallback 字体也要把图导出来（不阻塞用户）。
 */
export async function ensureFontsReady(timeoutMs = 2500): Promise<void> {
  try {
    if (!('fonts' in document)) return;
    await Promise.race([
      (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('font timeout')), timeoutMs)),
    ]);
  } catch {
    // 超时不阻塞导出
  }
}

/**
 * 在画布中央画一个斜置水印（不再铺满重复）。
 * 注意：这里不再自行判断是否要画 —— 调用方应先查 shouldWatermark()。
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
  ctx.save();

  // 单个水印，字号取画布短边的 14%
  const fontSize = Math.max(48, Math.min(width, height) * 0.14 * scale);
  ctx.font = `700 italic ${fontSize}px "ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = WATERMARK_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 在画布中心旋转 -22 度画一个
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-22 * Math.PI / 180);
  ctx.fillText(WATERMARK, 0, 0);

  ctx.restore();
}
