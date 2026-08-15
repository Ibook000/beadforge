import { describe, it, expect, vi } from 'vitest';
import { createStore } from './state';

describe('createStore', () => {
  it('初始状态应带默认参数', () => {
    const s = createStore().get();
    expect(s.build.widthCells).toBe(29);
    expect(s.build.heightCells).toBe(29);
    expect(s.build.paletteId).toBe('mard');
    expect(s.sheet.style).toBe('code');
    expect(s.image).toBeNull();
  });

  it('两个 store 之间不共享状态', () => {
    const a = createStore();
    const b = createStore();
    a.set({ imageName: 'a.png' });
    expect(b.get().imageName).toBe('');
  });

  it('set 应合并而不是替换', () => {
    const store = createStore();
    store.set({ imageName: 'a.png' });
    expect(store.get().imageName).toBe('a.png');
    expect(store.get().build.widthCells).toBe(29);
  });

  it('subscribe 应在 set 后被调用', () => {
    const store = createStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.set({ imageName: 'x' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0].imageName).toBe('x');
  });

  it('unsubscribe 后不应再被调用', () => {
    const store = createStore();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    store.set({ imageName: 'y' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('订阅者在回调里退订不应打乱本轮通知', () => {
    const store = createStore();
    const second = vi.fn();
    const off = store.subscribe(() => off());
    store.subscribe(second);
    expect(() => store.set({ imageName: 'z' })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
