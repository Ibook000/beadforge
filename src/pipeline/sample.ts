import { srgbToLinear, linearToSrgb } from '../color/space';

export type SampleMode = 'average' | 'median' | 'nearest';

/** 一张 RGBA 位图。data 长度为 width*height*4。 */
export interface RgbaGrid {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** 预建 sRGB → linear 查找表，256 项，避免逐像素调 Math.pow */
const LINEAR_LUT = new Float64Array(256);
for (let i = 0; i < 256; i++) LINEAR_LUT[i] = srgbToLinear(i / 255);

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 === 1 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * 把图片降采样到 outW × outH 格。
 *
 * average — 区域算术平均，在 linear RGB 空间做。
 *           在 sRGB 空间直接平均会偏暗：黑白棋盘格平均出来应该是 ~188 而不是 128。
 * median  — 区域各通道中位数，抗噪点，适合手机拍的照片
 * nearest — 取区域中心像素，适合输入本来就是像素画
 */
export function sampleImage(
  src: RgbaGrid,
  outW: number,
  outH: number,
  mode: SampleMode,
): RgbaGrid {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const sx = src.width / outW;
  const sy = src.height / outH;

  for (let oy = 0; oy < outH; oy++) {
    // 每格至少覆盖一个源像素，即使目标尺寸大于源尺寸
    const y0 = Math.min(src.height - 1, Math.floor(oy * sy));
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((oy + 1) * sy)));

    for (let ox = 0; ox < outW; ox++) {
      const x0 = Math.min(src.width - 1, Math.floor(ox * sx));
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((ox + 1) * sx)));
      const o = (oy * outW + ox) * 4;

      if (mode === 'nearest') {
        const cx = Math.min(src.width - 1, (x0 + x1 - 1) >> 1);
        const cy = Math.min(src.height - 1, (y0 + y1 - 1) >> 1);
        const s = (cy * src.width + cx) * 4;
        out[o] = src.data[s]!;
        out[o + 1] = src.data[s + 1]!;
        out[o + 2] = src.data[s + 2]!;
        out[o + 3] = src.data[s + 3]!;
        continue;
      }

      if (mode === 'median') {
        const rs: number[] = [];
        const gs: number[] = [];
        const bs: number[] = [];
        const as: number[] = [];
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const s = (y * src.width + x) * 4;
            rs.push(src.data[s]!);
            gs.push(src.data[s + 1]!);
            bs.push(src.data[s + 2]!);
            as.push(src.data[s + 3]!);
          }
        }
        out[o] = median(rs);
        out[o + 1] = median(gs);
        out[o + 2] = median(bs);
        out[o + 3] = median(as);
        continue;
      }

      // average：在 linear 空间累加
      let lr = 0;
      let lg = 0;
      let lb = 0;
      let sa = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const s = (y * src.width + x) * 4;
          lr += LINEAR_LUT[src.data[s]!]!;
          lg += LINEAR_LUT[src.data[s + 1]!]!;
          lb += LINEAR_LUT[src.data[s + 2]!]!;
          sa += src.data[s + 3]!;
          n++;
        }
      }
      out[o] = Math.round(linearToSrgb(lr / n) * 255);
      out[o + 1] = Math.round(linearToSrgb(lg / n) * 255);
      out[o + 2] = Math.round(linearToSrgb(lb / n) * 255);
      out[o + 3] = Math.round(sa / n);
    }
  }

  return { width: outW, height: outH, data: out };
}
