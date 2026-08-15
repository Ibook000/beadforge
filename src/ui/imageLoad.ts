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
