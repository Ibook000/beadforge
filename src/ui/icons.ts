/**
 * 内联 SVG 图标库。
 *
 * 沿用落地页（index.html 的 #landing）已确立的图标语言：
 *   stroke="currentColor" · 24×24 viewBox · stroke-width=2 · round cap/join
 * 统一从这里取，避免在 controls/statsPanel/activationModal 等多处重复粘贴长 path。
 * 旧版 UI 用 emoji（🌸🧽📝🎁⚠️✨）当图标，跨平台会渲染成彩色表情、风格不统一；
 * 换成矢量 SVG 后随主题变色、任意尺寸清晰。
 *
 * size 默认 18（按钮带文字时的常规尺寸）；小方钮（30~36px）用 16。
 */

function svg(inner: string, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export const ICON = {
  /** 全屏（四角向外展开）— 替代 ⛶ */
  expand: (size = 18) =>
    svg('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>', size),
  /** 关闭 / 退出 — 替代 ✕ */
  close: (size = 18) => svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', size),
  /** 上传 — 替代 🌸 */
  upload: (size = 18) =>
    svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', size),
  /** 橡皮擦 — 替代 🧽 */
  eraser: (size = 18) =>
    svg('<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>', size),
  /** 文字 / 排版 — 替代 📝 */
  type: (size = 18) =>
    svg('<polyline points="4 7 4 5 20 5 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="5" x2="12" y2="20"/>', size),
  /** 警告三角 — 替代 ⚠️ */
  alert: (size = 18) =>
    svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', size),
  /** 卡密 / 票据 — 替代 🎁（激活码语义更贴票据） */
  ticket: (size = 18) =>
    svg('<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/>', size),
  /** 已完成 / 已激活 — 替代 ✓ / ✦ */
  check: (size = 18) =>
    svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', size),
};
