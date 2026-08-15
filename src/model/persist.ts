import type { BuildParams } from '../pipeline/build';
import type { SheetOptions } from '../render/sheet';

export const ARCHIVE_KEY = 'pindou.archive.v1';
const ARCHIVE_VERSION = 1;

export interface Archive {
  version: 1;
  imageName: string;
  /** 降质后的原图。存不下时为 null，恢复时提示用户重新选图。 */
  imageDataUrl: string | null;
  build: BuildParams;
  sheet: SheetOptions;
  /** patch 序列化成数组 —— Map 不能直接 JSON.stringify */
  patch: Array<[number, number]>;
  savedAt: number;
}

export type SaveResult = 'ok' | 'no-image' | 'failed';

/**
 * 写入存档。
 *
 * 用户没要工程文件下载按钮，但要了手动编辑 —— 关掉标签页手改就全没了。
 * 自动存档解决这个矛盾：不多一个按钮，但刷新、崩溃、误关都能恢复。
 *
 * 原图 dataURL 可能撑爆 localStorage（约 5MB），因此分两级降级：
 * 完整存 → 丢掉原图只存参数 → 彻底放弃。
 */
export function saveArchive(a: Archive): SaveResult {
  const write = (payload: Archive): boolean => {
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  if (write(a)) return 'ok';
  if (write({ ...a, imageDataUrl: null })) return 'no-image';
  return 'failed';
}

export function loadArchive(): Archive | null {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Archive;
    // 版本不匹配就当没有 —— 老存档字段可能对不上，强行恢复会崩得更难看
    if (parsed?.version !== ARCHIVE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearArchive(): void {
  try {
    localStorage.removeItem(ARCHIVE_KEY);
  } catch {
    // 忽略
  }
}
