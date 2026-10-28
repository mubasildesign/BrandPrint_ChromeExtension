import { formatColor, hexToRgb, inkFor } from "./contrast.js";
import { colorName, designLanguage, voiceProfile } from "./analyze.js";
import { buildBrandMd } from "./brandmd.js";
import { brandName, escapeHtml as esc, fileBase, parseGradient, safeCss, safeFontFaces } from "./util.js";

const params = new URLSearchParams(location.search);
const isFull = params.get("view") === "full";
const isEmbed = params.get("embed") === "1";
const isDemo = params.get("demo") === "1";
function runtimeAlive() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function contextLost(error) {
  return /context invalidated/i.test(String(error?.message || error));
}

window.addEventListener("unhandledrejection", (event) => {
  if (!contextLost(event.reason)) return;
  event.preventDefault();
  showReconnect();
});

const hasChrome = runtimeAlive();

const MD_DISCLAIMER = "The spark, not the signed-off piece. Lovely for a brainstorm or a v1 draft.";
const CREDIT = `made with ❤️ by <a href="https://mubasil.me" target="_blank" rel="noopener noreferrer">Mubasil</a> for 🌍 design community`;
const SOURCE_NOTE = "This extension is open source under the MIT license. The source is on Mubasil’s Git account. You can find it from the website linked above.";

const app = document.querySelector("#app");
let current = null;
let analysis = null;
let format = "hex";
let printed = false;
let maximized = false;

const ICONS = {
  refresh: '<path d="M16 10a6 6 0 1 1-1.76-4.24"/><path d="M16 4v3.5h-3.5"/>',
  expand: '<path d="M12 4h4v4"/><path d="M8 16H4v-4"/><path d="m16 4-5 5"/><path d="m4 16 5-5"/>',
  shrink: '<path d="M8 4H4v4"/><path d="M12 16h4v-4"/><path d="m4 4 5 5"/><path d="m16 16-5-5"/>',
  close: '<path d="M5 5l10 10"/><path d="M15 5 5 15"/>',
  download: '<path d="M10 3.5v9"/><path d="m6 9 4 4 4-4"/><path d="M4 16.5h12"/>',
  copy: '<rect x="7" y="7" width="9" height="9" rx="2"/><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7"/>',
  check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
  wand: '<path d="m12.5 4.5 3 3"/><path d="M4 16l1.2-3.6L12 5.6l2.4 2.4-6.8 6.8z"/>',
  print: '<path d="M6 7V3.5h8V7"/><rect x="3.5" y="7" width="13" height="6.5" rx="1.5"/><path d="M6 11.5h8V16.5H6z"/>',
  layout: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14"/><path d="M8 8v8"/>',
  social: '<rect x="5.5" y="2.5" width="9" height="15" rx="2"/><path d="M9 14.5h2"/>',
  slides: '<rect x="2.5" y="4" width="15" height="10" rx="1.5"/><path d="M10 14v3"/><path d="M7 17h6"/>',
  doc: '<path d="M5.5 2.5h6l3 3v12h-9z"/><path d="M11.5 2.5v3h3"/><path d="M8 10h4"/><path d="M8 13h4"/>',
  video: '<rect x="2.5" y="5" width="11" height="10" rx="2"/><path d="m13.5 9 4-2.5v7l-4-2.5"/>',
  alert: '<circle cx="10" cy="10" r="7"/><path d="M10 6.5v4"/><path d="M10 13.5h.01"/>',
  spark: '<path d="M10 3v3"/><path d="M10 14v3"/><path d="M3 10h3"/><path d="M14 10h3"/><path d="m5 5 2 2"/><path d="m13 13 2 2"/><path d="m15 5-2 2"/><path d="m7 13-2 2"/>',
};

const icon = (name) =>
  `<svg class="i" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

if (isFull) document.body.classList.add("is-full");
if (isEmbed) document.body.classList.add("is-embed");
app.addEventListener("click", onClick);
app.addEventListener("pointerover", onTipHover);
app.addEventListener("focusin", onTipHover);
init();

function onTipHover(event) {
  const tip = event.target.closest(".tip");
  if (tip) positionTip(tip);
}

function positionTip(el) {
  const rect = el.getBoundingClientRect();
  const margin = 8;
  const short = el.classList.contains("tip-sm");
  const width = short
    ? Math.min(220, Math.max(72, (el.getAttribute("data-tip") || "").length * 6.5 + 22))
    : Math.min(240, window.innerWidth - margin * 2);
  const center = rect.left + rect.width / 2;
  const min = margin + width / 2;
  const max = window.innerWidth - margin - width / 2;
  const clamped = Math.min(Math.max(center, min), max);
  el.style.setProperty("--tip-dx", `${Math.round(clamped - center)}px`);
}

async function init() {
  if (isDemo) {
    runDemo();
    return;
  }
  if (!hasChrome) {
    showState("alert", "Open this guide from Chrome", "Load the unpacked Brandprint extension, open a website, and click its icon.");
    return;
  }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "session" && (changes.brandGuide || changes.brandGuideStatus)) {
        fromStorage().catch((error) => {
          if (contextLost(error)) showReconnect();
        });
      }
    });
    await fromStorage();
  } catch (error) {
    if (contextLost(error)) showReconnect();
    else showState("alert", "Couldn’t open the guide", "Click the Brandprint icon again.");
  }
}

async function fromStorage() {
  if (!runtimeAlive()) return showReconnect();
  const { brandGuide, brandGuideStatus } = await chrome.storage.session.get(["brandGuide", "brandGuideStatus"]);
  const state = brandGuideStatus?.state;
  if (state === "loading") return showLoading();
  if (state === "error") return showState("alert", "Couldn’t read this page", brandGuideStatus.message || "Open a website and try again.");
  if (brandGuide?.site) return render(brandGuide);
  showState("spark", "Open a site, then click the icon", "Brandprint reads the colors, type, and voice of the page you’re on. Nothing leaves your browser.");
}

async function runDemo() {
  showLoading();
  try {
    const frame = document.createElement("iframe");
    frame.title = "Sample page";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1280px;height:860px;border:0;";
    frame.src = new URL(params.get("url") || "../fixtures/landing.html", location.href).href;
    document.body.appendChild(frame);
    await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
    const doc = frame.contentDocument;
    await new Promise((resolve, reject) => {
      const script = doc.createElement("script");
      script.src = new URL("./extract.js", import.meta.url).href;
      script.onload = resolve;
      script.onerror = reject;
      doc.head.appendChild(script);
    });
    await doc.fonts?.ready;
    const result = JSON.parse(JSON.stringify(frame.contentWindow.__BRAND_GUIDE_EXTRACT__()));
    render({ ...result, picked: [], capturedAt: new Date().toISOString() });
  } catch (error) {
    showState("alert", "The sample page didn’t load", String(error?.message || error));
  }
}

function render(brand) {
  current = brand;
  analysis = { voice: voiceProfile(brand.copy || {}), language: designLanguage(brand) };
  mountFonts(brand);
  document.title = `Brandprint — ${brandName(brand)}`;
  const sections = [heroSection, colorSection, gradientSection, typeSection, interfaceSection, exportSection]
    .map((fn, index) => fn(brand, index))
    .join("");
  app.innerHTML = `${topbar(brand)}<main class="page"><div class="frame">${sections}${foot("Read from the live page in your browser. Nothing is uploaded.")}</div></main><div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
  maybePrint();
}

function topbar(brand) {
  const c = brand?.colors || {};
  const chip = [c.primary, c.secondary, c.tertiary, c.neutrals?.background]
    .filter((x) => x?.hex)
    .map((x) => `<span style="background:${esc(x.hex)}"></span>`)
    .join("");
  const jump = brand
    ? `<nav class="jump" aria-label="Sections">${[
        ["overview", "Overview"],
        ["color", "Color"],
        ...(brand.gradients?.length ? [["gradients", "Gradients"]] : []),
        ["type", "Type"],
        ["interface", "Interface"],
      ].map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}<a href="#export" class="tip" data-tip="${esc(MD_DISCLAIMER)}">brand.md</a></nav>`
    : "";
  return `
    <header class="topbar no-print">
      <div class="topbar-row">
        <div class="mark">${chip ? `<span class="mark-chip" aria-hidden="true">${chip}</span>` : ""}<span>BrandPrint</span></div>
        <div class="actions">
          <button type="button" class="icon-btn tip tip-sm" data-action="refresh" data-tip="Read this page again" aria-label="Read this page again">${icon("refresh")}</button>
          ${isEmbed ? `<button type="button" class="icon-btn tip tip-sm" data-action="maximize" aria-pressed="${maximized}" data-tip="${maximized ? "Make the panel smaller" : "Make the panel bigger"}" aria-label="${maximized ? "Make the panel smaller" : "Make the panel bigger"}">${icon(maximized ? "shrink" : "expand")}</button><button type="button" class="icon-btn tip tip-sm" data-action="close-overlay" data-tip="Close" aria-label="Close">${icon("close")}</button>` : isFull ? "" : `<button type="button" class="icon-btn tip tip-sm" data-action="open-full" data-tip="Open the full guide" aria-label="Open the full guide">${icon("expand")}</button>`}
          <button type="button" class="btn tip tip-sm" data-action="pdf" data-tip="Save a PDF" aria-label="Save a PDF" ${brand ? "" : "disabled"}>${icon("print")}${isEmbed ? "" : "<span>PDF</span>"}</button>
          <button type="button" class="btn btn-solid tip" data-action="md-download" data-tip="${esc(MD_DISCLAIMER)}" ${brand ? "" : "disabled"}>${icon("download")}<span>brand.md</span></button>
        </div>
      </div>
      ${jump}
    </header>`;
}

function heroSection(brand, n) {
  const c = brand.colors || {};
  const nt = c.neutrals || {};
  const head = brand.fonts?.secondary?.stack || "inherit";
  const strip = [c.primary, c.secondary, c.tertiary, ...(c.logo || []).slice(0, 1), nt.text, nt.background]
    .filter((x) => x?.hex)
    .map((x) => `<span style="background:${esc(x.hex)}" title="${esc(x.hex)}"></span>`)
    .join("");
  const text = brand.copy?.description || brand.copy?.h1?.[0] || "";
  return `
    <section class="card hero reveal" id="overview" style="--n:${n};--glow:${esc(c.primary?.hex || "transparent")}">
      <div class="hero-top">
        ${brand.site?.favicon ? `<img src="${esc(brand.site.favicon)}" alt="">` : ""}
        <span class="mono">${esc(brand.site?.host || "")}</span>
        ${verifyTag(brand)}
      </div>
      <h1 class="hero-name" style="font-family:${esc(safeCss(head, 240))}">${esc(brandName(brand))}</h1>
      ${text ? `<p class="hero-desc">${esc(text)}</p>` : ""}
      <div class="strip" aria-hidden="true">${strip}</div>
      <div class="chips">${analysis.language.traits.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
    </section>`;
}

function verifyTag(brand) {
  const v = brand.verification;
  if (v?.state === "checked") {
    const fixed = v.corrected ? ` · ${v.corrected} corrected` : "";
    return `<span class="tag ok" style="margin-left:auto">${icon("check")}Checked on screen${fixed}</span>`;
  }
  return `<span class="tag plain" style="margin-left:auto">Live CSS</span>`;
}

function colorSection(brand, n) {
  const c = brand.colors || {};
  const nt = c.neutrals || {};
  const tiles = [["primary", "Primary", c.primary], ["secondary", "Secondary", c.secondary], ["tertiary", "Tertiary", c.tertiary]]
    .filter(([, , color]) => color?.hex)
    .map(([key, label, color]) => tile(key, label, color))
    .join("");
  const minis = (list) => `<div class="swatch-row">${list.map(([label, color]) => mini(label, color)).join("")}</div>`;
  const neutrals = [["Background", nt.background], ["Surface", nt.surface], ["Text", nt.text], ["Muted text", nt.muted], ["Border", nt.border]].filter(([, x]) => x?.hex);
  const extra = [...(c.extra || []).map((x, i) => [`Accent ${i + 1}`, x]), ...(c.logo || []).map((x, i) => [`Logo ${i + 1}`, x])];
  const picked = (brand.picked || []).map((x, i) => [`Picked ${i + 1}`, x]);
  const unused = c.unused || [];
  return `
    <section class="section reveal" id="color" style="--n:${n}">
      <div class="section-head">
        <div><p class="eyebrow">Color</p><h2>Palette</h2></div>
        <div class="seg no-print" role="group" aria-label="Color format">
          ${["hex", "rgb", "hsl", "oklch"].map((f) => `<button type="button" data-action="format" data-format="${f}" aria-pressed="${format === f}">${f}</button>`).join("")}
        </div>
      </div>
      <p class="note">Ranked by what actually renders. Named CSS tokens only count when something visible uses them. Click any swatch to copy.</p>
      ${tiles ? `<div class="bento">${tiles}</div>` : `<div class="card state"><p>No strong brand color renders on this page. Use Pick color on the logo.</p></div>`}
      ${extra.length ? `<p class="subhead">Accents and logo</p>${minis(extra)}` : ""}
      ${neutrals.length ? `<p class="subhead">Neutrals</p>${minis(neutrals)}` : ""}
      ${picked.length ? `<p class="subhead">Picked from the screen</p>${minis(picked)}` : ""}
      ${unused.length ? `<details class="fold"><summary>${unused.length} declared ${unused.length === 1 ? "color isn’t" : "colors aren’t"} used on this page</summary><ul>${unused.map((t) => `<li><span class="mono">${esc(t.name)}</span> ${esc(t.hex)}</li>`).join("")}</ul></details>` : ""}
      <div class="inline-actions no-print">
        <button type="button" class="btn" data-action="pick">${icon("wand")}<span>Pick color from screen</span></button>
      </div>
    </section>`;
}

function tile(key, label, color) {
  const value = formatColor(color, format);
  const ink = inkFor(color);
  const fixed = Boolean(color.cssHex || color.declared);
  const tag = fixed
    ? `<span class="tag fix">Corrected</span>`
    : stateTag(color);
  const meta = fixed
    ? `CSS said ${esc(color.cssHex || color.declared?.hex)}`
    : esc((color.roles || []).slice(0, 3).join(" · ") || color.source || "");
  return `
    <button type="button" class="tile ${key}" data-action="copy" data-copy="${esc(value)}" aria-label="Copy ${esc(label)} ${esc(value)}" style="background:${esc(color.hex)};color:${ink}">
      <span class="tile-top"><span class="tile-role">${esc(label)}</span>${tag}</span>
      <span>
        <span class="tile-name">${esc(colorName(color))}</span>
        <strong class="tile-value">${esc(value)}</strong>
        <span class="tile-meta">${meta}</span>
      </span>
    </button>`;
}

function stateTag(color) {
  const state = color.verification?.state;
  if (state === "verified") return `<span class="tag">${icon("check")}On screen</span>`;
  if (state === "close") return `<span class="tag">Near match</span>`;
  return `<span class="tag">Live CSS</span>`;
}

function mini(label, color) {
  const value = formatColor(color, format);
  const fixed = color.cssHex || color.declared;
  return `
    <button type="button" class="mini" data-action="copy" data-copy="${esc(value)}" aria-label="Copy ${esc(label)} ${esc(value)}">
      <span class="dot" style="background:${esc(color.hex)}"></span>
      <span class="mini-text"><span class="mini-label">${esc(label)}${fixed ? " · corrected" : ""}</span><span class="mini-value">${esc(value)}</span></span>
    </button>`;
}

function typeSection(brand, n) {
  const head = brand.fonts?.secondary;
  const body = brand.fonts?.primary;
  if (!body?.family) return "";
  const same = head && head.family.toLowerCase() === body.family.toLowerCase();
  const rows = (brand.typeScale || []).map((s) => {
    const tracking = s.letterSpacing && s.letterSpacing !== "normal" ? s.letterSpacing : "0";
    return `
      <div class="scale-row">
        <span class="scale-tag">${esc(s.tag === "p" ? "P" : s.tag.toUpperCase())}</span>
        <div>
          <p class="scale-sample" style="--fs:${Number(s.size) || 16};font-family:${esc(safeCss(s.stack, 240))};font-weight:${esc(s.weight)};line-height:${esc(s.lineHeight)};letter-spacing:${esc(tracking)};text-transform:${esc(s.transform || "none")}">${esc(s.sample || "The quick brown fox jumps over the lazy dog")}</p>
          <p class="scale-meta">${esc(s.size)}px · ${esc(s.weight)} · ${esc(s.lineHeight)} · ${esc(s.family)}</p>
        </div>
      </div>`;
  }).join("");
  return `
    <section class="section reveal" id="type" style="--n:${n}">
      <div class="section-head"><div><p class="eyebrow">Typography</p><h2>Typefaces and scale</h2></div></div>
      <div class="type-grid">
        ${family(same ? "Headlines and body" : "Headlines", head || body)}
        ${same ? "" : family("Body", body)}
      </div>
      ${rows ? `<div class="card scale">${rows}</div>` : ""}
    </section>`;
}

function family(role, font) {
  const stack = esc(safeCss(font.stack || font.family, 240));
  const status = { web: "Web font · loaded", system: "System font", generic: "Browser default", unknown: "Unconfirmed" }[font.status] || "Unconfirmed";
  const swap = font.declared && font.declared.toLowerCase() !== font.family.toLowerCase();
  return `
    <article class="card family">
      <p class="eyebrow">${esc(role)}</p>
      <div class="family-aa" style="font-family:${stack}">Aa</div>
      <div>
        <h3 style="font-family:${stack}">${esc(font.family)}</h3>
        <p class="muted" style="font-size:12px">${esc(status)}${font.weights?.length ? ` · ${esc(font.weights.join(", "))}` : ""}</p>
        ${swap ? `<p style="margin-top:6px"><span class="tag warn">Fallback</span> <span class="muted" style="font-size:12px">${esc(font.declared)} is declared but doesn’t load</span></p>` : ""}
      </div>
      <p class="glyphs" style="font-family:${stack}">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 &amp; ? ! “ ”</p>
    </article>`;
}

function interfaceSection(brand, n) {
  const bg = brand.colors?.neutrals?.background?.hex || "#ffffff";
  const button = buttonCard(brand.button, brand.buttonSecondary, bg);
  const max = Math.max(1, ...(brand.space || []).map((s) => s.px));
  const space = (brand.space || []).length
    ? `<article class="card ui-card"><p class="eyebrow">Spacing scale</p><div class="bars">${brand.space.map((s) => `<div class="bar-row"><span>${esc(s.px)}px</span><span class="bar" style="width:${Math.max(4, (s.px / max) * 100)}%"></span></div>`).join("")}</div></article>`
    : "";
  const radii = (brand.radii || []).length
    ? `<article class="card ui-card"><p class="eyebrow">Corner radius</p><div class="radii">${brand.radii.map((r) => `<span class="radius"><span style="border-radius:${r.px >= 999 ? "999px" : `${r.px}px`}"></span><span>${esc(r.label)}</span></span>`).join("")}</div></article>`
    : "";
  const body = [button, space, radii].filter(Boolean).join("");
  if (!body) return "";
  return `
    <section class="section reveal" id="interface" style="--n:${n}">
      <div class="section-head"><div><p class="eyebrow">Interface</p><h2>Buttons, space, corners</h2></div></div>
      <div class="ui-grid">${body}</div>
    </section>`;
}

function gradientSection(brand, n) {
  const cards = gradientCards(brand.gradients || []);
  if (!cards) return "";
  return `
    <section class="section reveal" id="gradients" style="--n:${n}">
      <div class="section-head"><div><p class="eyebrow">Color</p><h2>Gradients</h2></div></div>
      <div class="grad-grid">${cards}</div>
    </section>`;
}

function buttonCard(primary, secondary, bg) {
  if (!primary) return "";
  const specimens = [["Primary", primary], ["Secondary", secondary]]
    .filter(([, b]) => b)
    .map(([label, b]) => buttonSpecimen(label, b, bg))
    .join("");
  return `<article class="card ui-card"><p class="eyebrow">Buttons</p><div class="btn-specimens">${specimens}</div></article>`;
}

function buttonSpecimen(label, b, bg) {
  const stageBg = b.surface || bg;
  const fill = b.background?.hex
    ? `background:${esc(b.background.hex)}`
    : b.backgroundImage
      ? `background-image:${esc(safeCss(b.backgroundImage, 300))}`
      : "background:transparent";
  const radiusPx = parseFloat(b.radius) || 0;
  const isPill = radiusPx >= 999 || (b.height && radiusPx >= b.height / 2 - 1);
  const chips = [
    [isPill ? "Pill" : esc(b.radius), "radius"],
    [esc(compactPadding(b.padding)), "padding"],
    [`${esc(b.height)}px`, "tall"],
  ];
  return `
    <div class="btn-specimen">
      <p class="specimen-label">${esc(label)}</p>
      <div class="stage" style="background:${esc(stageBg)}">
        <span class="specimen-btn" style="display:inline-flex;align-items:center;${fill};color:${esc(b.color?.hex || "inherit")};border-radius:${esc(safeCss(b.radius, 60))};padding:${esc(safeCss(b.padding, 80))};font-family:${esc(safeCss(b.fontFamily, 240))};font-size:${esc(b.fontSize)};font-weight:${esc(b.fontWeight)};letter-spacing:${esc(b.letterSpacing || "normal")};text-transform:${esc(b.textTransform || "none")};border:${esc(safeCss(b.border, 80) || "0")};box-shadow:${esc(safeCss(b.shadow, 300) || "none")};white-space:nowrap">Button</span>
      </div>
      <div class="chips chips-sm">${chips.map(([value, tag]) => `<span class="chip chip-sm">${value}<span class="chip-tag">${esc(tag)}</span></span>`).join("")}</div>
    </div>`;
}

function compactPadding(padding) {
  const parts = String(padding || "").split(/\s+/).map((p) => parseFloat(p) || 0);
  if (parts.length < 4) return padding || "";
  const [top, right, bottom, left] = parts;
  if (top === bottom && right === left) return `${Math.round(top)} · ${Math.round(right)}px`;
  return parts.map((p) => Math.round(p)).join(" · ") + "px";
}

function gradientCards(values) {
  return values
    .map((value) => {
      const css = safeCss(value, 800);
      if (!css) return "";
      const parsed = parseGradient(css);
      const bar = `<div class="gradient" style="background-image:${esc(css)}"></div>`;
      if (!parsed) return `<article class="card grad-card">${bar}<p class="grad-code">${esc(css)}</p></article>`;
      const how = [parsed.kind, parsed.direction].filter(Boolean).join(" · ");
      const stops = parsed.stops
        .map((stop) => `<li><span class="dot" style="background:${esc(stop.hex)}"></span><span>${esc(stop.hex)}</span><span>${stop.percent}%</span></li>`)
        .join("");
      return `<article class="card grad-card">${bar}<div class="grad-meta"><p class="grad-how">${esc(how)}</p><ul class="stops">${stops}</ul><p class="grad-code">${esc(parsed.css)}</p></div></article>`;
    })
    .filter(Boolean)
    .join("");
}

function foot(note) {
  return `${note ? `<p class="foot">${esc(note)}</p>` : ""}<p class="credit">${CREDIT}</p><p class="source-note">${esc(SOURCE_NOTE)}</p>`;
}

function exportSection(_brand, n) {
  const uses = [["layout", "Landing pages"], ["social", "Social posts"], ["slides", "Slides"], ["doc", "PDF documents"], ["video", "Video"]];
  return `
    <section class="section reveal" id="export" style="--n:${n}">
      <div class="card export">
        <div class="export-head">
          <p class="eyebrow">Export</p>
          <h2>brand.md</h2>
          <p class="disclaimer">brand.md is the spark, not the signed-off piece. AI assets from it are wonderful for a brainstorm or a v1 draft. A designer still takes it to the finish.</p>
        </div>
        <p>One file that design tools and AI assistants can build from. It holds the verified values, the voice, and the rules for each format.</p>
        <p class="export-next">You can generate the assets below from this brand.md file. The outputs depend on the AI model and the prompt, not only on the brand.md file. These are not a finished design. Treat them as a v1, a quick draft, or a brainstorm.</p>
        <div class="uses">${uses.map(([i, label]) => `<span class="use">${icon(i)}${esc(label)}</span>`).join("")}</div>
        <div class="inline-actions no-print">
          <button type="button" class="btn btn-solid tip tip-up" data-action="md-download" data-tip="${esc(MD_DISCLAIMER)}">${icon("download")}<span>Download brand.md</span></button>
          <button type="button" class="btn tip tip-up" data-action="md-copy" data-tip="${esc(MD_DISCLAIMER)}">${icon("copy")}<span>Copy</span></button>
        </div>
      </div>
    </section>`;
}

function showLoading() {
  current = null;
  app.innerHTML = `${topbar(null)}
    <main class="page" aria-busy="true"><div class="frame">
      <div class="card hero"><div class="skel" style="height:14px;width:40%"></div><div class="skel" style="height:56px;width:70%;margin:20px 0 12px"></div><div class="skel" style="height:14px;width:85%"></div><div class="skel" style="height:40px;margin-top:20px"></div></div>
      <div class="bento" style="margin-top:36px"><div class="skel tile primary"></div><div class="skel tile"></div><div class="skel tile"></div></div>
      ${foot("Reading colors, type, and voice from the live page…")}
    </div></main>`;
}

function showState(name, title, copy) {
  current = null;
  app.innerHTML = `${topbar(null)}
    <main class="page"><div class="frame">
      <div class="card state">
        <div class="state-icon">${icon(name)}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(copy)}</p>
      </div>
      ${foot("")}
    </div></main>`;
}

function showReconnect() {
  showState("alert", "Brandprint refreshed", "Click the Brandprint icon on this page again.");
}

async function onClick(event) {
  try {
    await handleClick(event);
  } catch (error) {
    if (contextLost(error) || !runtimeAlive()) showReconnect();
    else toast("That didn’t work. Click the Brandprint icon and try again.");
  }
}

async function handleClick(event) {
  const tipTarget = event.target.closest(".tip");
  if (tipTarget) flashTip(tipTarget);
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "format") {
    format = target.dataset.format || "hex";
    const y = window.scrollY;
    render(current);
    window.scrollTo(0, y);
  } else if (action === "copy") {
    await writeClipboard(target.dataset.copy || "", "Copied");
  } else if (action === "pick") {
    await pickColor();
  } else if (action === "refresh") {
    await refresh();
  } else if (action === "open-full") {
    openFull(false);
  } else if (action === "maximize") {
    maximized = !maximized;
    document.body.classList.toggle("is-wide", maximized);
    window.parent.postMessage({ source: "brand-guide", type: "maximize", value: maximized }, "*");
    const label = maximized ? "Make the panel smaller" : "Make the panel bigger";
    target.setAttribute("aria-pressed", String(maximized));
    target.setAttribute("aria-label", label);
    target.dataset.tip = label;
    target.innerHTML = icon(maximized ? "shrink" : "expand");
  } else if (action === "close-overlay") {
    window.parent.postMessage({ source: "brand-guide", type: "close" }, "*");
  } else if (action === "pdf") {
    if (!current) return;
    if (isFull || !hasChrome) window.print();
    else openFull(true);
  } else if (action === "md-download") {
    if (!current) return;
    await download(`${fileBase(current)}-brand.md`, buildBrandMd(current, analysis), "text/markdown");
    toast("Downloaded. A spark for a v1 draft, not the finished piece.");
  } else if (action === "md-copy") {
    if (!current) return;
    await writeClipboard(buildBrandMd(current, analysis), "Copied. A spark for a v1 draft, not the finished piece.");
  }
}

function flashTip(node) {
  positionTip(node);
  node.classList.add("show-tip");
  clearTimeout(node._tipTimer);
  node._tipTimer = setTimeout(() => node.classList.remove("show-tip"), 2600);
}

async function refresh() {
  if (!runtimeAlive()) {
    if (!hasChrome) location.reload();
    else showReconnect();
    return;
  }
  showLoading();
  const response = await chrome.runtime.sendMessage({ type: "refresh" });
  if (response && !response.ok) fromStorage();
}

function openFull(print) {
  if (!runtimeAlive()) {
    if (!hasChrome) {
      const next = new URL(location.href);
      next.searchParams.set("view", "full");
      location.href = next.toString();
    } else showReconnect();
    return;
  }
  chrome.runtime.sendMessage({ type: "open-guide", print }).catch((error) => {
    if (contextLost(error)) showReconnect();
  });
}

async function pickColor() {
  if (!window.EyeDropper) return toast("Color picking isn’t available here.");
  if (!current) return toast("Read a page first.");
  try {
    const { sRGBHex } = await new EyeDropper().open();
    const color = hexToRgb(sRGBHex);
    if (!color) return;
    if (!(current.picked || []).some((item) => item.hex === color.hex)) {
      current.picked = [...(current.picked || []), { ...color, roles: ["Picked"], source: "Picked from the screen", verification: { state: "verified" } }];
    }
    if (runtimeAlive()) await chrome.storage.session.set({ brandGuide: current });
    else render(current);
    toast(`Added ${color.hex}`);
  } catch (error) {
    if (error?.name !== "AbortError") toast("Couldn’t pick a color.");
  }
}

async function download(filename, text, type) {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  if (runtimeAlive() && chrome.downloads?.download) {
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename, saveAs: false });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

async function writeClipboard(text, message) {
  if (!text) return;
  if (!isEmbed && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
      return;
    } catch {
      /* Fall through to the selection copy, which works inside the page overlay. */
    }
  }
  if (copyWithExec(text)) {
    toast(message);
    return;
  }
  try {
    await navigator.clipboard?.writeText(text);
    toast(message);
  } catch {
    toast("Couldn’t copy.");
  }
}

function copyWithExec(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
  document.body.appendChild(area);
  const y = window.scrollY;
  area.focus({ preventScroll: true });
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  window.scrollTo(0, y);
  return ok;
}

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.hidden = true;
  }, 2200);
}

function mountFonts(brand) {
  document.getElementById("brand-font-faces")?.remove();
  document.querySelectorAll("link[data-brand-font]").forEach((node) => node.remove());
  const style = document.createElement("style");
  style.id = "brand-font-faces";
  style.textContent = safeFontFaces(brand.fonts?.facesCss || "");
  document.head.appendChild(style);
  (brand.fonts?.links || []).forEach((href) => {
    if (!/^https:\/\/(fonts\.googleapis\.com|use\.typekit\.net)\//i.test(href)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.brandFont = "1";
    document.head.appendChild(link);
  });
}

function maybePrint() {
  if (printed || params.get("print") !== "1" || !current) return;
  printed = true;
  const go = () => setTimeout(() => window.print(), 300);
  if (document.fonts?.ready) document.fonts.ready.then(go);
  else go();
}
