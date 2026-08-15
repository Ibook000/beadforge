import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveArchive, loadArchive, clearArchive, ARCHIVE_KEY, type Archive } from './persist';
import { DEFAULT_BUILD_PARAMS } from '../pipeline/build';
import { DEFAULT_SHEET_OPTIONS } from '../render/sheet';

function makeStorage(limitBytes = Infinity) {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limitBytes) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function archive(overrides: Partial<Archive> = {}): Archive {
  return {
    version: 1,
    imageName: 'a.png',
    imageDataUrl: 'data:image/jpeg;base64,AAAA',
    build: { ...DEFAULT_BUILD_PARAMS, widthCells: 29, heightCells: 29 },
    sheet: { ...DEFAULT_SHEET_OPTIONS },
    patch: [[3, 7]],
    savedAt: 1700000000000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
});

describe('存档', () => {
  it('没有存档时 load 返回 null', () => {
    expect(loadArchive()).toBeNull();
  });

  it('存了能完整读回来', () => {
    expect(saveArchive(archive())).toBe('ok');
    const a = loadArchive()!;
    expect(a.imageName).toBe('a.png');
    expect(a.build.widthCells).toBe(29);
    expect(a.patch).toEqual([[3, 7]]);
    expect(a.imageDataUrl).toBe('data:image/jpeg;base64,AAAA');
  });

  it('超限时应降级为不存原图，但保住参数和手改', () => {
    vi.stubGlobal('localStorage', makeStorage(600));
    const big = archive({ imageDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(5000) });
    expect(saveArchive(big)).toBe('no-image');
    const a = loadArchive()!;
    expect(a.imageDataUrl).toBeNull();
    expect(a.patch).toEqual([[3, 7]]);
    expect(a.build.widthCells).toBe(29);
  });

  it('连不存原图都放不下时返回 failed', () => {
    vi.stubGlobal('localStorage', makeStorage(10));
    expect(saveArchive(archive())).toBe('failed');
  });

  it('坏数据应返回 null 而不抛异常', () => {
    localStorage.setItem(ARCHIVE_KEY, '{坏了');
    expect(loadArchive()).toBeNull();
  });

  it('版本号不匹配的存档应被忽略', () => {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify({ ...archive(), version: 99 }));
    expect(loadArchive()).toBeNull();
  });

  it('clearArchive 应删掉存档', () => {
    saveArchive(archive());
    clearArchive();
    expect(loadArchive()).toBeNull();
  });
});
