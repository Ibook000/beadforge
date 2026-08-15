import type { RgbaGrid } from './sample';

/**
 * 决定每格放不放豆。
 *
 * @param alphaThreshold alpha 低于此值视为空格，默认 128
 * @param bgTolerance    纯色背景剔除容差 0–100，0 = 关闭。
 *                       背景色取四角像素各通道的中位数 ——
 *                       比取单个角稳健，一个角上有主体也不会误判。
 */
export function buildMask(
  src: RgbaGrid,
  alphaThreshold: number,
  bgTolerance: number,
): Uint8Array {
  const n = src.width * src.height;
  const mask = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    mask[i] = src.data[i * 4 + 3]! >= alphaThreshold ? 1 : 0;
  }

  if (bgTolerance <= 0) return mask;

  const bg = cornerMedian(src);
  // 容差 0–100 映射到 RGB 欧氏距离 0–441.673（= 255*√3）
  const maxDist = (bgTolerance / 100) * 441.673;

  for (let i = 0; i < n; i++) {
    if (mask[i] === 0) continue;
    const o = i * 4;
    const dr = src.data[o]! - bg[0];
    const dg = src.data[o + 1]! - bg[1];
    const db = src.data[o + 2]! - bg[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= maxDist) mask[i] = 0;
  }

  return mask;
}

/** 取四角像素各通道的中位数作为背景色 */
function cornerMedian(src: RgbaGrid): [number, number, number] {
  const { width: w, height: h, data } = src;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  const chan = (k: number): number => {
    const vs = corners.map((o) => data[o + k]!).sort((a, b) => a - b);
    return (vs[1]! + vs[2]!) / 2;
  };
  return [chan(0), chan(1), chan(2)];
}
