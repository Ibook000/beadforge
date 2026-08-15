import type { RgbaGrid } from './sample';

export interface AdjustParams {
  /** 亮度倍数，1 = 不变 */
  brightness: number;
  /** 对比度，1 = 不变，围绕中灰 128 拉伸 */
  contrast: number;
  /** 饱和度，1 = 不变，0 = 灰度 */
  saturation: number;
  /**
   * 伽马，1 = 不变。输出 = 输入^(1/gamma)，与 Photoshop / ImageMagick 一致：
   * > 1 提亮暗部，< 1 压暗暗部。
   */
  gamma: number;
}

export const DEFAULT_ADJUST: AdjustParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  gamma: 1,
};

/** Rec.709 亮度权重，用于饱和度调整时的灰度基准 */
const LR = 0.2126;
const LG = 0.7152;
const LB = 0.0722;

/**
 * 亮度 / 对比度 / 饱和度 / 伽马调整。
 * 不改 alpha 通道，返回新的 RgbaGrid，不修改输入。
 */
export function adjust(src: RgbaGrid, p: AdjustParams): RgbaGrid {
  const out = new Uint8ClampedArray(src.data);

  const isIdentity =
    p.brightness === 1 && p.contrast === 1 && p.saturation === 1 && p.gamma === 1;
  if (isIdentity) return { width: src.width, height: src.height, data: out };

  for (let i = 0; i < out.length; i += 4) {
    let r = out[i]!;
    let g = out[i + 1]!;
    let b = out[i + 2]!;

    if (p.brightness !== 1) {
      r *= p.brightness;
      g *= p.brightness;
      b *= p.brightness;
    }

    // 对比度：围绕中灰 128
    if (p.contrast !== 1) {
      r = (r - 128) * p.contrast + 128;
      g = (g - 128) * p.contrast + 128;
      b = (b - 128) * p.contrast + 128;
    }

    // 饱和度：向亮度灰插值
    if (p.saturation !== 1) {
      const gray = LR * r + LG * g + LB * b;
      r = gray + (r - gray) * p.saturation;
      g = gray + (g - gray) * p.saturation;
      b = gray + (b - gray) * p.saturation;
    }

    if (p.gamma !== 1) {
      const inv = 1 / p.gamma;
      r = 255 * Math.pow(Math.max(0, Math.min(1, r / 255)), inv);
      g = 255 * Math.pow(Math.max(0, Math.min(1, g / 255)), inv);
      b = 255 * Math.pow(Math.max(0, Math.min(1, b / 255)), inv);
    }

    // Uint8ClampedArray 赋值时自动截断到 0–255 并取整
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }

  return { width: src.width, height: src.height, data: out };
}
