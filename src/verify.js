const MATCH = 12;
const CORRECT = 24;

export async function verifyOnScreen(result, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  return applyVerification(result, image);
}

export function applyVerification(result, image) {
  const out = structuredClone(result);
  const viewWidth = out.viewport?.width || image.width;
  const scale = image.width / viewWidth;
  const outcomes = new Map();

  for (const [hex, points] of Object.entries(out.probes || {})) {
    const samples = points.map((point) => sample(image, point.x * scale, point.y * scale)).filter(Boolean);
    if (!samples.length) continue;
    const mid = median(samples);
    const spread = Math.max(...samples.map((s) => dist(s, mid)));
    const gap = dist(mid, fromHex(hex));
    const screen = toHex(mid);
    if (gap <= MATCH) outcomes.set(hex, { state: "verified", screen });
    else if (spread <= MATCH && gap >= CORRECT) outcomes.set(hex, { state: "corrected", screen, css: hex });
    else outcomes.set(hex, { state: "close", screen });
  }

  const replaced = new Map();
  eachColor(out.colors, (color) => {
    const outcome = outcomes.get(color.hex);
    if (!outcome) {
      color.verification = color.verification || { state: "css" };
      return;
    }
    color.verification = { ...outcome };
    if (outcome.state === "corrected") {
      replaced.set(color.hex, outcome.screen);
      color.cssHex = color.hex;
      Object.assign(color, fromHex(outcome.screen), { hex: outcome.screen });
      color.source = `Rendered on screen as ${outcome.screen}; computed CSS said ${color.cssHex}`;
    }
  });

  if (replaced.size) {
    (out.contrast || []).forEach((pair) => {
      if (replaced.has(pair.bg?.hex)) Object.assign(pair.bg, fromHex(replaced.get(pair.bg.hex)), { hex: replaced.get(pair.bg.hex) });
    });
    const bg = out.button?.background;
    if (bg && replaced.has(bg.hex)) Object.assign(bg, fromHex(replaced.get(bg.hex)), { hex: replaced.get(bg.hex) });
  }

  if (out.logoRect && out.colors) {
    const exclude = [out.colors.neutrals?.background, out.colors.neutrals?.surface, out.colors.neutrals?.text]
      .filter(Boolean)
      .map((color) => fromHex(color.hex));
    out.colors.logo = dominantColors(image, out.logoRect, scale, exclude).map((color) => ({
      ...color,
      roles: ["Logo"],
      source: "Sampled from the logo on screen",
      verification: { state: "verified", screen: color.hex },
    }));
    if (!out.colors.primary && out.colors.logo[0]) {
      out.colors.primary = { ...out.colors.logo[0], source: "Taken from the logo; the CSS has no strong brand color" };
    }
  }

  const states = [];
  eachColor(out.colors, (color) => states.push(color.verification?.state || "css"));
  out.verification = {
    state: "checked",
    verified: states.filter((s) => s === "verified").length,
    close: states.filter((s) => s === "close").length,
    corrected: states.filter((s) => s === "corrected").length,
    unchecked: states.filter((s) => s === "css").length,
  };
  return out;
}

export function eachColor(colors, fn) {
  if (!colors) return;
  ["primary", "secondary", "tertiary"].forEach((key) => colors[key] && fn(colors[key]));
  (colors.extra || []).forEach((color) => color && fn(color));
  Object.values(colors.neutrals || {}).forEach((color) => color && fn(color));
}

export function dominantColors(image, rect, scale, exclude) {
  const x0 = Math.max(0, Math.floor(rect.x * scale));
  const y0 = Math.max(0, Math.floor(rect.y * scale));
  const x1 = Math.min(image.width, Math.ceil((rect.x + rect.width) * scale));
  const y1 = Math.min(image.height, Math.ceil((rect.y + rect.height) * scale));
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const step = Math.max(1, Math.floor(Math.sqrt(area / 6000)));
  const groups = new Map();
  let total = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * image.width + x) * 4;
      const px = { r: image.data[i], g: image.data[i + 1], b: image.data[i + 2] };
      total += 1;
      const span = Math.max(px.r, px.g, px.b) - Math.min(px.r, px.g, px.b);
      if (span < 32) continue;
      if (exclude.some((color) => dist(color, px) < 24)) continue;
      const key = `${px.r >> 4}-${px.g >> 4}-${px.b >> 4}`;
      const group = groups.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      group.count += 1;
      group.r += px.r;
      group.g += px.g;
      group.b += px.b;
      groups.set(key, group);
    }
  }
  const picked = [];
  [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .forEach((group) => {
      if (picked.length >= 3 || group.count / Math.max(total, 1) < 0.05) return;
      const color = { r: Math.round(group.r / group.count), g: Math.round(group.g / group.count), b: Math.round(group.b / group.count) };
      if (picked.some((other) => dist(other, color) < 40)) return;
      picked.push(color);
    });
  return picked.map((color) => ({ ...color, hex: toHex(color) }));
}

function sample(image, x, y) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (cx < 1 || cy < 1 || cx >= image.width - 1 || cy >= image.height - 1) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const i = ((cy + dy) * image.width + (cx + dx)) * 4;
      r += image.data[i];
      g += image.data[i + 1];
      b += image.data[i + 2];
    }
  }
  return { r: Math.round(r / 9), g: Math.round(g / 9), b: Math.round(b / 9) };
}

function median(samples) {
  const pick = (key) => {
    const values = samples.map((s) => s[key]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return { r: pick("r"), g: pick("g"), b: pick("b") };
}

function fromHex(hex) {
  const raw = String(hex).replace("#", "");
  return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
}

function toHex(color) {
  return `#${[color.r, color.g, color.b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
}

function dist(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}
