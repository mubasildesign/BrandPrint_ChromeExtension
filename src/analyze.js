import { contrastRatio, hexToRgb, relativeLuminance, rgbToHex, rgbToHsl } from "./contrast.js";

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both
  but by can could did do does doing down during each few for from further get gets got had has have having he her here
  hers him his how i if in into is it its itself just let lets me more most my no nor not now of off on once one only or
  other our ours out over own same she should so some such than that the their them then there these they this those
  through to too two under until up us very via was we were what when where which while who whom why will with would
  you your yours yourself new every per may might must make makes made need needs use used using way ways like just
  well get still even much many really thing things see read more learn start today`.split(/\s+/)
);

const CLICHES = ["elevate", "seamless", "unleash", "next-gen", "game-changer", "game changer", "delve", "revolutionize", "supercharge", "cutting-edge", "synergy", "world-class"];

const SERIF = /georgia|times|garamond|playfair|merriweather|lora|baskerville|caslon|didot|bodoni|newsreader|fraunces|dm serif|libre|crimson|spectral|source serif|noto serif|pt serif|tiempos|lyon|freight|canela|editorial|recoleta|cormorant|instrument serif|serif/i;
const MONO = /mono|code|courier|consolas|menlo/i;

export function colorName(color) {
  if (!color) return "";
  const { h, s, l } = rgbToHsl(color);
  const span = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  if (span <= 30 || s < 0.12 || l <= 0.07 || l >= 0.97) {
    const warm = span > 6 && h >= 20 && h <= 60;
    const cool = span > 6 && h >= 190 && h <= 250;
    const tint = warm ? "Warm " : cool ? "Cool " : "";
    if (l >= 0.97) return "White";
    if (l >= 0.9) return `${tint}off-white`.replace(/^./, (c) => c.toUpperCase());
    if (l >= 0.7) return `${tint}light gray`.replace(/^./, (c) => c.toUpperCase());
    if (l >= 0.4) return `${tint}gray`.replace(/^./, (c) => c.toUpperCase());
    if (l >= 0.16) return `${tint}charcoal`.replace(/^./, (c) => c.toUpperCase());
    return "Near black";
  }
  const hues = [
    [12, "red"], [40, "orange"], [52, "amber"], [65, "yellow"], [90, "lime"], [150, "green"], [175, "teal"],
    [195, "cyan"], [225, "blue"], [250, "indigo"], [280, "violet"], [310, "purple"], [335, "magenta"], [350, "pink"], [361, "red"],
  ];
  const hue = hues.find(([limit]) => h < limit)[1];
  let tone = "";
  if (l < 0.3) tone = "Deep ";
  else if (l > 0.78) tone = s < 0.6 ? "Pale " : "Light ";
  else if (s < 0.35) tone = "Muted ";
  else if (s > 0.8 && l >= 0.4 && l <= 0.62) tone = "Bright ";
  return `${tone}${hue}`.replace(/^./, (c) => c.toUpperCase());
}

export function mixHex(a, b, amount) {
  const x = typeof a === "string" ? hexToRgb(a) : a;
  const y = typeof b === "string" ? hexToRgb(b) : b;
  if (!x || !y) return "";
  return rgbToHex({
    r: x.r + (y.r - x.r) * amount,
    g: x.g + (y.g - x.g) * amount,
    b: x.b + (y.b - x.b) * amount,
  });
}

export function isSerif(family) {
  const name = String(family || "");
  if (/sans/i.test(name)) return false;
  return SERIF.test(name);
}

export function isMono(family) {
  return MONO.test(String(family || ""));
}

export function designLanguage(brand) {
  const colors = brand?.colors || {};
  const bg = colors.neutrals?.background;
  const primary = colors.primary;
  const traits = [];

  const mode = bg && relativeLuminance(bg) < 0.18 ? "dark" : "light";
  traits.push(mode === "dark" ? "Dark canvas" : "Light canvas");

  let saturation = "balanced";
  if (primary) {
    const { s, l } = rgbToHsl(primary);
    if (s > 0.62 && l > 0.28 && l < 0.72) saturation = "vivid";
    else if (s < 0.35 || l < 0.18) saturation = "muted";
    traits.push(`${saturation === "vivid" ? "Vivid" : saturation === "muted" ? "Muted" : "Balanced"} ${colorName(primary).toLowerCase()} accent`);
  } else {
    saturation = "monochrome";
    traits.push("Monochrome palette");
  }

  const radii = (brand?.radii || []).map((r) => r.px);
  const buttonRadius = parseFloat(brand?.button?.radius) || 0;
  const buttonHeight = brand?.button?.height || 0;
  const pillButton = buttonRadius >= 999 || (buttonHeight && buttonRadius >= buttonHeight / 2 - 1);
  const maxRadius = Math.max(0, ...radii.filter((px) => px < 999));
  let corners = "soft";
  if (maxRadius <= 3 && !pillButton) corners = "sharp";
  else if (maxRadius >= 14) corners = "rounded";
  traits.push(pillButton ? "Pill-shaped buttons" : corners === "sharp" ? "Sharp corners" : corners === "rounded" ? "Generously rounded corners" : "Softly rounded corners");

  const shadows = brand?.shadows || [];
  let elevation = "flat";
  if (shadows.length) {
    const blurs = shadows.map((shadow) => {
      const nums = shadow.match(/-?\d+(\.\d+)?px/g) || [];
      return parseFloat(nums[2]) || 0;
    });
    elevation = Math.max(...blurs) >= 18 ? "diffuse" : "crisp";
  }
  traits.push(elevation === "flat" ? "Flat surfaces" : elevation === "diffuse" ? "Soft, diffuse shadows" : "Crisp, tight shadows");

  const heading = brand?.fonts?.secondary?.family || "";
  const body = brand?.fonts?.primary?.family || "";
  const headingStyle = isMono(heading) ? "mono" : isSerif(heading) ? "serif" : "sans";
  traits.push(headingStyle === "serif" ? "Editorial serif headlines" : headingStyle === "mono" ? "Technical mono headlines" : "Clean sans-serif headlines");

  const steps = brand?.typeScale || [];
  const h1 = steps.find((s) => s.tag === "h1") || steps.find((s) => s.tag !== "p");
  const p = steps.find((s) => s.tag === "p");
  const ratio = h1 && p ? h1.size / p.size : 2.5;
  const scale = ratio >= 3.2 ? "dramatic" : ratio >= 2 ? "confident" : "restrained";
  traits.push(`${scale[0].toUpperCase()}${scale.slice(1)} type scale`);

  const space = (brand?.space || []).map((s) => s.px);
  const largest = Math.max(0, ...space);
  const density = largest >= 64 ? "airy" : largest >= 32 ? "balanced" : "compact";
  traits.push(density === "airy" ? "Airy spacing" : density === "balanced" ? "Balanced spacing" : "Compact spacing");

  const gradients = (brand?.gradients || []).length > 0;
  if (gradients) traits.push("Uses gradients");

  return {
    traits,
    mode,
    saturation,
    corners,
    pillButton,
    elevation,
    headingStyle,
    bodyStyle: isMono(body) ? "mono" : isSerif(body) ? "serif" : "sans",
    singleFamily: heading.toLowerCase() === body.toLowerCase(),
    scale,
    ratio: Math.round(ratio * 100) / 100,
    density,
    gradients,
  };
}

export function voiceProfile(copy) {
  const c = copy || {};
  const headings = [...(c.h1 || []), ...(c.h2 || []), ...(c.h3 || [])];
  const prose = [c.description, ...(c.paragraphs || [])].filter(Boolean);
  const all = [...headings, ...prose, ...(c.ctas || [])].join(" ");
  const sentences = splitSentences(prose.join(" "));
  const sentencePool = sentences.length >= 3 ? sentences : splitSentences([...prose, ...headings].join(". "));
  const wordsOf = (text) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const totalWords = sentencePool.reduce((sum, s) => sum + wordsOf(s).length, 0);
  const avgSentence = sentencePool.length ? Math.round((totalWords / sentencePool.length) * 10) / 10 : 0;
  const share = (re) => (sentencePool.length ? sentencePool.filter((s) => re.test(s)).length / sentencePool.length : 0);
  const youRate = share(/\byou(r|rs|'re|’re|'ll|’ll)?\b/i);
  const weRate = share(/\b(we|our|ours|we're|we’re)\b/i);
  const blocks = [...headings, ...prose];
  const exclaimRate = blocks.length ? blocks.filter((s) => s.includes("!")).length / blocks.length : 0;
  const questionRate = blocks.length ? blocks.filter((s) => /\?\s*$/.test(s)).length / blocks.length : 0;
  const numberRate = blocks.length ? blocks.filter((s) => /\d/.test(s.replace(/\b(19|20)\d{2}\b/g, ""))).length / blocks.length : 0;
  const headingWords = headings.length ? Math.round((headings.reduce((sum, h) => sum + wordsOf(h).length, 0) / headings.length) * 10) / 10 : 0;
  const headingCase = detectCase(headings);

  const syllables = sentencePool.reduce((sum, s) => sum + wordsOf(s).reduce((n, w) => n + countSyllables(w), 0), 0);
  const ease = totalWords && sentencePool.length
    ? Math.round(206.835 - 1.015 * (totalWords / sentencePool.length) - 84.6 * (syllables / totalWords))
    : null;

  const ctaVerbs = countTop((c.ctas || []).map((cta) => wordsOf(cta)[0]?.toLowerCase()).filter(Boolean), 5);
  const keywords = countTop(
    wordsOf(all.toLowerCase()).filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)),
    10
  ).filter((item) => item.count >= 2);
  const cliches = CLICHES.filter((word) => all.toLowerCase().includes(word));

  const traits = [];
  if (avgSentence && avgSentence <= 12) traits.push({ label: "Direct", detail: `Sentences average ${avgSentence} words.` });
  else if (avgSentence && avgSentence <= 20) traits.push({ label: "Measured", detail: `Sentences average ${avgSentence} words.` });
  else if (avgSentence) traits.push({ label: "Detailed", detail: `Long sentences, about ${avgSentence} words each.` });
  if (youRate >= 0.25) traits.push({ label: "Customer-first", detail: `${pct(youRate)} of sentences speak to “you”.` });
  if (weRate >= 0.2 && weRate > youRate) traits.push({ label: "Company voice", detail: `${pct(weRate)} of sentences use “we” or “our”.` });
  if (exclaimRate >= 0.08) traits.push({ label: "Energetic", detail: `Exclamation marks in ${pct(exclaimRate)} of lines.` });
  else if (blocks.length) traits.push({ label: "Calm", detail: "Almost no exclamation marks." });
  if (numberRate >= 0.15) traits.push({ label: "Proof-led", detail: `Numbers appear in ${pct(numberRate)} of lines.` });
  if (questionRate >= 0.08) traits.push({ label: "Conversational", detail: `Asks questions in ${pct(questionRate)} of lines.` });
  if (headingWords && headingWords <= 6) traits.push({ label: "Punchy headlines", detail: `Headlines run about ${headingWords} words.` });
  else if (headingWords >= 10) traits.push({ label: "Explanatory headlines", detail: `Headlines run about ${headingWords} words.` });
  if (ease != null && ease >= 60) traits.push({ label: "Plain language", detail: `Reading ease ${ease} (easy for most readers).` });
  else if (ease != null && ease < 40) traits.push({ label: "Expert register", detail: `Reading ease ${ease} (dense, specialist).` });

  const english = !c.lang || /^en/i.test(c.lang);
  return {
    traits,
    summary: traits.slice(0, 3).map((t) => t.label).join(", ") || "Not enough copy on this page",
    avgSentence,
    youRate,
    weRate,
    exclaimRate,
    questionRate,
    numberRate,
    headingWords,
    headingCase,
    readingEase: ease,
    ctaVerbs,
    keywords,
    cliches,
    english,
    enoughCopy: blocks.length >= 3,
  };
}

export function contrastPairsFor(brand) {
  const c = brand?.colors || {};
  const n = c.neutrals || {};
  const fgs = [
    ["Text", n.text],
    ["Muted text", n.muted],
    ["Primary", c.primary],
    ["Secondary", c.secondary],
    ["Tertiary", c.tertiary],
    ["Background", n.background],
    ["White", { hex: "#ffffff", r: 255, g: 255, b: 255 }],
  ];
  const bgs = [
    ["Background", n.background],
    ["Surface", n.surface],
    ["Primary", c.primary],
    ["Secondary", c.secondary],
    ["Tertiary", c.tertiary],
  ];
  const neutralBg = new Set(["Background", "Surface"]);
  const seen = new Set();
  const out = [];
  fgs.forEach(([fgName, fg]) => {
    if (!fg?.hex) return;
    bgs.forEach(([bgName, bg]) => {
      if (!bg?.hex || fg.hex === bg.hex) return;
      if (fgName === "Muted text" && !neutralBg.has(bgName)) return;
      const key = `${fg.hex}|${bg.hex}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ fgName, bgName, fg: fg.hex, bg: bg.hex, ratio: Math.round(contrastRatio(fg, bg) * 100) / 100 });
    });
  });
  return {
    text: out.filter((pair) => pair.ratio >= 4.5),
    large: out.filter((pair) => pair.ratio >= 3 && pair.ratio < 4.5),
    avoid: out.filter((pair) => pair.ratio < 3 && pair.fgName !== "White"),
  };
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“'‘(])/u)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

function detectCase(lines) {
  const counts = { upper: 0, title: 0, sentence: 0, lower: 0 };
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with", "vs", "via"]);
  lines.forEach((line) => {
    const words = line.match(/\p{L}[\p{L}'’-]*/gu) || [];
    if (words.length < 2) return;
    const letters = words.join("");
    if (letters === letters.toUpperCase()) counts.upper += 1;
    else if (letters === letters.toLowerCase()) counts.lower += 1;
    else {
      const big = words.filter((w, i) => i === 0 || !small.has(w.toLowerCase()));
      const capped = big.filter((w) => w[0] === w[0].toUpperCase()).length;
      if (capped / big.length >= 0.8 && big.length > 1) counts.title += 1;
      else counts.sentence += 1;
    }
  });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return "sentence";
  return best[0];
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function countTop(items, limit) {
  const map = new Map();
  items.forEach((item) => map.set(item, (map.get(item) || 0) + 1));
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}
