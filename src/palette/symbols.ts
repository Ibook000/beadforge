/**
 * 高辨识度符号库。挑选原则：字形轮廓差异大，小字号下仍可分辨，
 * 黑白打印不糊。刻意避开了形近的组合（○ 与 ◦、■ 与 ▪、I 与 l 与 1）。
 *
 * 上游色卡数据自带的 symbol 列没有采用 —— 那是按 ASCII 码序机器分配的，
 * MARD 的红色 F4 分到 "è"、黑色 H16 分到 "Ζ"，人眼无法区分。
 */
const SYMBOLS = [
  '■', '○', '▲', '◆', '★', '●', '□', '△', '◇', '☆',
  '▼', '▽', '✚', '✕', '♥', '♦', '♣', '♠', '☀', '☁',
  '◐', '◑', '◒', '◓', '⬢', '⬡', '➤', '➜', '⌘', '⌂',
  '§', '¶', '†', '‡', '№', '℮', 'Ω', 'π', 'µ', 'λ',
  '2', '3', '4', '5', '6', '7', '8', '9', '0', '@',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
  'L', 'M', 'N', 'P', 'R', 'S', 'T', 'U', 'V', 'W',
  'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g',
] as const;

/**
 * 为一张图纸实际用到的颜色分配符号。
 *
 * 只需保证**这几种之间**可辨，不必给全色卡 291 个静态符号 ——
 * 一张图纸通常只用 10–30 色。
 *
 * 分配顺序按豆号升序（不是传入顺序），保证同一张图纸每次渲染
 * 得到相同的符号，屏幕预览和导出的 PNG/PDF 不会对不上。
 * 超出符号库容量时回退到双字符组合，仍然唯一。
 */
export function assignSymbols(beadIndices: readonly number[]): Map<number, string> {
  const sorted = [...new Set(beadIndices)].sort((a, b) => a - b);
  const map = new Map<number, string>();

  sorted.forEach((beadIndex, i) => {
    if (i < SYMBOLS.length) {
      map.set(beadIndex, SYMBOLS[i]!);
    } else {
      const k = i - SYMBOLS.length;
      const a = SYMBOLS[Math.floor(k / SYMBOLS.length) % SYMBOLS.length]!;
      const b = SYMBOLS[k % SYMBOLS.length]!;
      map.set(beadIndex, a + b);
    }
  });

  return map;
}
