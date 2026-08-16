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
          // 取一套覆盖各色系的基础色（24 色均匀分布），而非前 N 个
          const total = palette.beads.length;
          const step = Math.max(1, Math.floor(total / 24));
          const indices: number[] = [];
          for (let i = 0; i < total && indices.length < 24; i += step) {
            indices.push(i);
          }
          commit(indices);
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
