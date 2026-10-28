export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function safeCss(value, max = 1200) {
  const text = String(value ?? "");
  if (/<\/|javascript:|expression\s*\(|-moz-binding|@import|url\(/i.test(text)) return "";
  return text.slice(0, max);
}

export function safeFontFaces(css) {
  const blocks = String(css ?? "").match(/@font-face\s*\{[^}]*\}/gi) || [];
  return blocks
    .filter((block) => {
      if (!/font-family\s*:/i.test(block)) return false;
      if (/javascript:|expression\s*\(|@import|</i.test(block)) return false;
      const urls = [...block.matchAll(/url\(\s*['"]?([^'")]+)/gi)].map((match) => match[1].trim());
      return urls.every((url) => /^https?:\/\//i.test(url));
    })
    .join("\n");
}

export function brandName(brand) {
  const name = String(brand?.site?.name || brand?.site?.host || "Brand").trim();
  return name.length > 42 ? brand?.site?.host || name.slice(0, 42) : name;
}

export function parseGradient(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/is);
  if (!match) return null;
  const kind = `${match[1] ? "repeating " : ""}${match[2].toLowerCase()}`;
  const args = splitGradientArgs(match[3]);
  if (!args.length) return null;
  let direction = "";
  let stopArgs = args;
  if (!/^(#|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lab\(|lch\(|color\()/i.test(args[0])) {
    direction = args[0];
    stopArgs = args.slice(1);
  }
  const stops = stopArgs.map(parseGradientStop).filter(Boolean);
  if (!stops.length) return null;
  fillGradientPercents(stops);
  return { kind, direction, css: raw, stops };
}

function splitGradientArgs(input) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      out.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last) out.push(last);
  return out;
}

function parseGradientStop(arg) {
  const position = arg.match(/(-?\d+(?:\.\d+)?)%\s*$/);
  const colorText = (position ? arg.slice(0, position.index) : arg).trim();
  const hex = gradientColorHex(colorText);
  if (!hex) return null;
  return { hex, percent: position ? Math.round(parseFloat(position[1])) : null };
}

function gradientColorHex(text) {
  const hex = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let value = hex[1];
    if (value.length === 3 || value.length === 4) value = value.slice(0, 3).split("").map((char) => char + char).join("");
    if (value.length >= 6) return `#${value.slice(0, 6).toLowerCase()}`;
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!rgb) return null;
  return `#${[rgb[1], rgb[2], rgb[3]]
    .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function fillGradientPercents(stops) {
  if (stops[0].percent == null) stops[0].percent = 0;
  if (stops[stops.length - 1].percent == null) stops[stops.length - 1].percent = 100;
  for (let index = 0; index < stops.length; index += 1) {
    if (stops[index].percent != null) continue;
    let end = index;
    while (end < stops.length && stops[end].percent == null) end += 1;
    const left = stops[index - 1].percent;
    const right = stops[end].percent;
    const steps = end - index + 1;
    for (let step = 0; step < end - index; step += 1) {
      stops[index + step].percent = Math.round(left + ((right - left) * (step + 1)) / steps);
    }
    index = end - 1;
  }
}

export function fileBase(brand) {
  const host = brand?.site?.host || "brand";
  return host.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "brand";
}
