import type { RgbaGrid } from '../pipeline/sample';

/** 存档用的降质上限：最长边 1200px，避免 localStorage 超限 */
const ARCHIVE_MAX_EDGE = 1200;
/** 管线处理上限：降采样目标最多 200 格，源图再大也没有意义 */
const PROCESS_MAX_EDGE = 2000;

export async function loadImageFile(file: File): Promise<{ grid: RgbaGrid; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    return {
      grid: toRgbaGrid(bitmap, PROCESS_MAX_EDGE),
      dataUrl: toDataUrl(bitmap, ARCHIVE_MAX_EDGE),
    };
  } finally {
    bitmap.close();
  }
}

/** 从 dataURL 恢复（localStorage 存档回读用） */
export async function loadImageDataUrl(dataUrl: string): Promise<RgbaGrid> {
  const res = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    return toRgbaGrid(bitmap, PROCESS_MAX_EDGE);
  } finally {
    bitmap.close();
  }
}

function scaledSize(bitmap: ImageBitmap, maxEdge: number): [number, number] {
  const longest = Math.max(bitmap.width, bitmap.height);
  const k = longest > maxEdge ? maxEdge / longest : 1;
  return [Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k))];
}

function toRgbaGrid(bitmap: ImageBitmap, maxEdge: number): RgbaGrid {
  const [w, h] = scaledSize(bitmap, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

function toDataUrl(bitmap: ImageBitmap, maxEdge: number): string {
  const [w, h] = scaledSize(bitmap, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  // 白底：JPEG 无 alpha，透明区不铺白会变成黑块
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * 把文字渲染成图片，走和上传图片同一条管线。
 *
 * 用离屏 canvas 画文字 → 取 ImageData → 转成 dataURL。
 * 文字本身是矢量，画到 canvas 后取像素，再当普通图喂给管线采样。
 * 白底黑字，拼出来就是深色字配浅背景。
 *
 * @param text   要渲染的文字
 * @param fontPx 字号（像素）。越大越清晰，但太大会超出 PROCESS_MAX_EDGE 被缩
 * @param font  CSS font 字符串，如 '700 80px "ZCOOL KuaiLe"'
 */
export function textToImageDataUrl(text: string, fontPx: number, font: string): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  // 先量字宽：设个初始宽，measureText 给出实际宽
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const wPx = Math.max(1, Math.ceil(metrics.width)) + fontPx * 0.4;
  const hPx = Math.ceil(fontPx * 1.4);

  canvas.width = Math.min(PROCESS_MAX_EDGE, wPx);
  canvas.height = Math.min(PROCESS_MAX_EDGE, hPx);
  const ctx2 = canvas.getContext('2d')!;
  // 重新设字体（canvas 尺寸变了会重置）
  ctx2.font = font;
  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(0, 0, canvas.width, canvas.height);
  ctx2.fillStyle = '#000000';
  ctx2.textBaseline = 'middle';
  ctx2.textAlign = 'left';
  ctx2.fillText(text, fontPx * 0.2, canvas.height / 2);

  return canvas.toDataURL('image/png');
}

/** 从 dataURL 恢复 RgbaGrid（文字图也走这条） */
export async function imageDataUrlToGrid(dataUrl: string): Promise<RgbaGrid> {
  return loadImageDataUrl(dataUrl);
}
