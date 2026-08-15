import type { Lab } from './space';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** 25^7，CIEDE2000 里 G 与 R_C 项用到的常数 */
const POW25_7 = 6103515625;

/** Lab 空间欧氏距离（ΔE*ab, CIE 1976） */
export function cie76(a: Lab, b: Lab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * CIEDE2000 色差，kL = kC = kH = 1。
 *
 * 实现严格依照 Sharma/Wu/Dalal (2005) 的公式编号。两个最容易写错的地方：
 *   1. 色相角必须换算到 [0, 360)，而不是 atan2 原始的 (-180, 180]
 *   2. 平均色相 h̄' 在两角差 > 180° 时需要 ±360 修正
 * 写错的表现是"匹配结果略微有点怪"，肉眼极难发现 ——
 * 所以 distance.test.ts 里的官方 34 组数据是唯一可靠的验证手段。
 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  // (2) C*ab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);

  // (3) 平均 C*ab
  const Cbar = (C1 + C2) / 2;

  // (4) G —— 对 a* 的补偿，让近中性色的色相更稳定
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));

  // (5) a'
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;

  // (6) C'
  const Cp1 = Math.sqrt(ap1 * ap1 + b1 * b1);
  const Cp2 = Math.sqrt(ap2 * ap2 + b2 * b2);

  // (7) h' —— atan2 结果换算到 [0, 360)；a'=b'=0 时定义为 0
  const hp = (ap: number, bp: number): number => {
    if (ap === 0 && bp === 0) return 0;
    const h = Math.atan2(bp, ap) * RAD;
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(ap1, b1);
  const hp2 = hp(ap2, b2);

  // (8) ΔL'
  const dLp = L2 - L1;

  // (9) ΔC'
  const dCp = Cp2 - Cp1;

  // (10) Δh' —— 任一 C' 为 0 时定义为 0；否则取绝对值 ≤ 180 的那个方向
  let dhp: number;
  if (Cp1 * Cp2 === 0) {
    dhp = 0;
  } else {
    const diff = hp2 - hp1;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }

  // (11) ΔH'
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp / 2) * DEG);

  // (12) 平均 L'
  const Lbarp = (L1 + L2) / 2;

  // (13) 平均 C'
  const Cbarp = (Cp1 + Cp2) / 2;

  // (14) 平均 h' —— 最容易写错的地方
  let hbarp: number;
  if (Cp1 * Cp2 === 0) {
    hbarp = hp1 + hp2;
  } else {
    const sum = hp1 + hp2;
    const absDiff = Math.abs(hp1 - hp2);
    if (absDiff <= 180) hbarp = sum / 2;
    else if (sum < 360) hbarp = (sum + 360) / 2;
    else hbarp = (sum - 360) / 2;
  }

  // (15) T
  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG) +
    0.24 * Math.cos(2 * hbarp * DEG) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG);

  // (16) Δθ
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));

  // (17) R_C
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));

  // (18) S_L
  const Lm50sq = (Lbarp - 50) * (Lbarp - 50);
  const SL = 1 + (0.015 * Lm50sq) / Math.sqrt(20 + Lm50sq);

  // (19) S_C
  const SC = 1 + 0.045 * Cbarp;

  // (20) S_H
  const SH = 1 + 0.015 * Cbarp * T;

  // (21) R_T —— 蓝区旋转项
  const RT = -Math.sin(2 * dTheta * DEG) * RC;

  // (22) ΔE00，kL = kC = kH = 1
  const termL = dLp / SL;
  const termC = dCp / SC;
  const termH = dHp / SH;

  return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH);
}
