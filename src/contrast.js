export function rgbToHex({ r, g, b }) {
  const channel = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    hex: `#${full.toLowerCase()}`,
  };
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function linearChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }) {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function contrastRatio(a, b) {
  const left = relativeLuminance(a);
  const right = relativeLuminance(b);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastGrade(ratio, sizePx, weight) {
  const large = sizePx >= 24 || (sizePx >= 18.66 && Number(weight) >= 700);
  if (ratio >= 7) return { label: "AAA", pass: true };
  if (ratio >= 4.5) return { label: "AA", pass: true };
  if (large && ratio >= 3) return { label: "AA large", pass: true };
  return { label: "Below AA", pass: false };
}

export function formatRgb(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export function formatHsl(color) {
  const { h, s, l } = rgbToHsl(color);
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

export function formatOklch(color) {
  const r = linearChannel(color.r);
  const g = linearChannel(color.g);
  const b = linearChannel(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let hue = (Math.atan2(B, A) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  if (C < 0.0005) hue = 0;
  return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${hue.toFixed(1)})`;
}

export function formatColor(color, format) {
  if (!color) return "";
  if (format === "rgb") return formatRgb(color);
  if (format === "hsl") return formatHsl(color);
  if (format === "oklch") return formatOklch(color);
  return color.hex || rgbToHex(color);
}

export function inkFor(color) {
  const paper = { r: 246, g: 243, b: 236 };
  const ink = { r: 27, g: 25, b: 20 };
  return contrastRatio(color, paper) >= contrastRatio(color, ink) ? "#f6f3ec" : "#1b1914";
}
