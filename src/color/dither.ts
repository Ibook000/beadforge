import { srgbToLinear, linearToSrgb, type RGB } from './space';
import type { Matcher } from './matcher';
import type { Bead } from '../palette/types';
import type { RgbaGrid } from '../pipeline/sample';

export type DitherMode = 'none' | 'atkinson' | 'floyd-steinberg';

/** [dx, dy, 权重] —— 权重之和即扩散比例 */
const KERNELS: Record<
  Exclude<DitherMode, 'none'>,
  ReadonlyArray<readonly [number, number, number]>
> = {
  // Atkinson 只扩散 3/4 误差，平面更干净，孤立噪点更少 ——
  // 拼豆场景下每一颗噪点都是一次实打实的手工劳动，所以这个更合适
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
  'floyd-steinberg': [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
};

/**
 * 把采样后的图量化成豆号网格。
 *
 * 误差扩散在 linear RGB 空间累加 —— 在感知空间（Lab）累加会扭曲扩散权重。
 * 空格（mask=0）不参与匹配，也不接收误差。
 *
 * 注意：抖动模式下每个像素的输入色都被误差扰动过，匹配器的缓存基本失效。
 * 这是抖动的隐性成本，属于预期行为。
 */
export function quantizeToCells(
  src: RgbaGrid,
  mask: Uint8Array,
  matcher: Matcher,
  beads: readonly Bead[],
  mode: DitherMode,
): Uint16Array {
  const { width: w, height: h, data } = src;
  const cells = new Uint16Array(w * h);

  if (mode === 'none') {
    for (let i = 0; i < w * h; i++) {
      if (mask[i] !== 1) continue;
      const o = i * 4;
      cells[i] = matcher.match([data[o]!, data[o + 1]!, data[o + 2]!]);
    }
    return cells;
  }

  const kernel = KERNELS[mode];

  // linear 空间的工作缓冲，误差累加在这里
  const buf = new Float64Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    buf[i * 3] = srgbToLinear(data[o]! / 255);
    buf[i * 3 + 1] = srgbToLinear(data[o + 1]! / 255);
    buf[i * 3 + 2] = srgbToLinear(data[o + 2]! / 255);
  }

  const to8 = (lin: number): number =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(Math.max(0, Math.min(1, lin))) * 255)));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;

      const b = i * 3;
      const rgb: RGB = [to8(buf[b]!), to8(buf[b + 1]!), to8(buf[b + 2]!)];
      const beadIndex = matcher.match(rgb);
      cells[i] = beadIndex;

      // 在 linear 空间算误差
      const chosen = beads[beadIndex]!.rgb;
      const errR = buf[b]! - srgbToLinear(chosen[0] / 255);
      const errG = buf[b + 1]! - srgbToLinear(chosen[1] / 255);
      const errB = buf[b + 2]! - srgbToLinear(chosen[2] / 255);

      for (const [dx, dy, weight] of kernel) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] !== 1) continue; // 空格不接收误差
        const nb = ni * 3;
        buf[nb] = buf[nb]! + errR * weight;
        buf[nb + 1] = buf[nb + 1]! + errG * weight;
        buf[nb + 2] = buf[nb + 2]! + errB * weight;
      }
    }
  }

  return cells;
}
