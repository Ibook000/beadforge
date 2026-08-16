import type { Store } from './state';
import { getPalette, PALETTE_IDS } from '../palette/registry';
import { loadSubset, saveSubset } from '../palette/subset';

/**
 * 「我有的豆子」勾选面板。
 *
 * 实拼时最刚需的功能：买的是 48 色套装，图纸却给了 80 种颜色，等于白生成。
 * 空集表示全选 —— 新用户不用先勾 291 个格子才能开始用。
 */
export function mountPalettePanel(root: HTMLElement, store: Store, onRebuild: () => void): void {
  const section = document.createElement('div');
  root.appendChild(section);

  function commit(indices: number[]): void {
    const s = store.get();
    const id = s.build.paletteId;
    const total = getPalette(id).beads.length;
    // 全选就存空数组：语义更清晰，也省 localStorage 空间
    const normalized = indices.length === total ? [] : indices;
    saveSubset(id, normalized);
    store.set({ allowed: { ...s.allowed, [id]: normalized } });
    render();
    onRebuild();
  }

  function render(): void {
    const s = store.get();
    const palette = getPalette(s.build.paletteId);
    const selected = new Set(s.allowed[palette.id] ?? []);
    const isAll = selected.size === 0;

    section.innerHTML = `
      <h2>我有的豆子</h2>
      <div class="readout">${
        isAll
          ? `未筛选，使用全部 ${palette.beads.length} 色`
          : `已选 ${selected.size} / ${palette.beads.length} 色`
      }</div>
      <div class="row">
        <button class="btn" data-act="all">全选</button>
        <button class="btn" data-act="none">只留常用</button>
        <button class="btn" data-act="invert">反选</button>
      </div>
      <div class="swatch-grid"></div>
    `;

    const grid = section.querySelector('.swatch-grid') as HTMLElement;
    palette.beads.forEach((bead, i) => {
      const el = document.createElement('div');
      el.className = 'swatch' + (isAll || selected.has(i) ? '' : ' off');
      el.style.background = bead.hex;
      el.title = `${bead.code}　${bead.nameZh}　${bead.hex}`;
      el.addEventListener('click', () => {
        // 从「全选」状态点第一下，视为"除了这颗以外全都有"
        const next = isAll ? new Set(palette.beads.map((_, k) => k)) : new Set(selected);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        commit([...next]);
      });
      grid.appendChild(el);
    });

    section.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'all') {
          commit([]);
        } else if (act === 'none') {
          // 取一套覆盖各色系的基础色：先包含黑白（最暗/最亮），再均匀采样补足到 24
          const total = palette.beads.length;
          // 找最暗和最亮的颜色（接近黑/白）
          const byLuma = palette.beads
            .map((b, i) => ({ i, v: 0.2126 * b.rgb[0] + 0.7152 * b.rgb[1] + 0.0722 * b.rgb[2] }))
            .sort((a, b) => a.v - b.v);
          const darkest = byLuma[0]!;
          const lightest = byLuma[byLuma.length - 1]!;
          const pick = new Set<number>([darkest.i, lightest.i]);
          // 均匀采样补足到 24
          const step = Math.max(1, Math.floor(total / 24));
          for (let i = 0; i < total && pick.size < 24; i += step) {
            pick.add(i);
          }
          commit([...pick]);
        } else if (act === 'invert') {
          const cur = isAll ? new Set(palette.beads.map((_, k) => k)) : selected;
          const inverted = palette.beads.map((_, k) => k).filter((k) => !cur.has(k));
          commit(inverted.length === 0 ? [0] : inverted);
        }
      });
    });
  }

  // 启动时从 localStorage 恢复所有色卡的勾选
  const restored: Record<string, number[]> = { ...store.get().allowed };
  for (const id of PALETTE_IDS) restored[id] = loadSubset(id);
  store.set({ allowed: restored });

  // 切色卡时重绘面板
  let lastPaletteId = store.get().build.paletteId;
  store.subscribe((s) => {
    if (s.build.paletteId !== lastPaletteId) {
      lastPaletteId = s.build.paletteId;
      render();
    }
  });

  render();
}
