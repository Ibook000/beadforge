export type RGB = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** D65 白点，2° 观察者 */
const Xn = 95.047;
const Yn = 100.0;
const Zn = 108.883;

/** sRGB 传输函数的逆：伽马编码值 → 线性光。入参出参均 0–1。 */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB 传输函数：线性光 → 伽马编码值。入参出参均 0–1。 */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

function labFInv(t: number): number {
  return t > 6 / 29 ? t * t * t : (108 / 841) * (t - 4 / 29);
}

export function rgbToLab(rgb: RGB): Lab {
  const r = srgbToLinear(rgb[0] / 255);
  const g = srgbToLinear(rgb[1] / 255);
  const b = srgbToLinear(rgb[2] / 255);

  // sRGB → XYZ (D65)，乘 100 使 Y 落在 0–100
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100;
  const Y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100;

  const fx = labF(X / Xn);
  const fy = labF(Y / Yn);
  const fz = labF(Z / Zn);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(lab: Lab): RGB {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;

  const X = labFInv(fx) * Xn;
  const Y = labFInv(fy) * Yn;
  const Z = labFInv(fz) * Zn;

  const x = X / 100;
  const y = Y / 100;
  const z = Z / 100;

  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  const to8 = (v: number) =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(Math.max(0, Math.min(1, v))) * 255)));

  return [to8(r), to8(g), to8(b)];
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: RGB): string {
  return (
    '#' +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Rec.709 相对亮度，0–1。
 * 用于决定图纸格子里的文字取黑还是白：> 0.55 取黑。
 */
export function luma(rgb: RGB): number {
  const r = srgbToLinear(rgb[0] / 255);
  const g = srgbToLinear(rgb[1] / 255);
  const b = srgbToLinear(rgb[2] / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
