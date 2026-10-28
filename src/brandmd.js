import { formatHsl, formatRgb } from "./contrast.js";
import { colorName, contrastPairsFor, designLanguage, mixHex, voiceProfile } from "./analyze.js";
import { brandName, parseGradient } from "./util.js";

export function buildBrandMd(brand, analysis = {}) {
  const voice = analysis.voice || voiceProfile(brand.copy || {});
  const look = analysis.language || designLanguage(brand);
  const c = brand.colors || {};
  const n = c.neutrals || {};
  const copy = brand.copy || {};
  const name = brandName(brand);
  const date = (brand.capturedAt || new Date().toISOString()).slice(0, 10);
  const url = brand.site?.url || "";
  const head = brand.fonts?.secondary || {};
  const body = brand.fonts?.primary || {};
  const steps = brand.typeScale || [];
  const h1 = steps.find((s) => s.tag === "h1") || steps.find((s) => s.tag !== "p");
  const p = steps.find((s) => s.tag === "p");
  const pairs = contrastPairsFor(brand);
  const primaryCta = copy.ctas?.[0] || brand.button?.text || "";
  const caseWord = { title: "Title Case", sentence: "Sentence case", upper: "UPPERCASE", lower: "lowercase" }[voice.headingCase] || "Sentence case";
  const space = (brand.space || []).map((s) => s.px);
  const bigSpace = Math.max(48, ...space);
  const accent = c.primary;
  const L = [];
  const add = (...lines) => L.push(...lines);
  const sw = (color) => (color?.hex ? `${colorName(color)} \`${color.hex}\`` : "—");

  add(
    "---",
    `brand: ${yaml(name)}`,
    `source: ${yaml(url)}`,
    `captured: ${date}`,
    `language: ${copy.lang || "unknown"}`,
    `mode: ${look.mode}`,
    "generator: Brandprint Chrome extension (read from the live page, no AI)",
    "---",
    "",
    `# ${name} brand system`,
    "",
    `${name}'s visual and verbal system, read from the live site on ${date}. Use it as the source of truth for landing pages, social posts, slides, PDF documents, and video made for ${name}.`,
    "",
    "**How to use this file.** Every value below was measured on the live page. When a general design rule in this file conflicts with a brand value, the brand wins. When the brand is silent, follow the general rule. Never fill gaps with invented colors, fonts, statistics, quotes, or logos.",
    "",
    "> **The spark, not the signed-off piece.** Use this file to brainstorm or spin up a v1 draft with AI. It is not the final output. A designer still takes it across the finish line.",
    ""
  );

  add("## At a glance", "", "| | |", "|---|---|");
  if (copy.description) add(`| What it says it is | ${cell(copy.description)} |`);
  if (copy.h1?.[0]) add(`| Main headline | “${cell(copy.h1[0])}” |`);
  add(
    `| Design language | ${look.traits.join(" · ")} |`,
    `| Voice | ${voice.traits.map((t) => t.label).join(" · ") || "Not enough copy to judge"} |`,
    `| Primary color | ${sw(c.primary)} |`,
    `| Headline font | ${head.family || "—"} |`,
    `| Body font | ${body.family || "—"} |`
  );
  if (primaryCta) add(`| Main call to action | “${cell(primaryCta)}” |`);
  add("");

  add("## 1. Color", "", "### Palette", "", "| Role | Name | Hex | RGB | HSL | Used on | Check |", "|---|---|---|---|---|---|---|");
  const rows = [
    ["Primary", c.primary],
    ["Secondary", c.secondary],
    ["Tertiary", c.tertiary],
    ...(c.extra || []).map((color, i) => [`Accent ${i + 1}`, color]),
    ...(c.logo || []).map((color, i) => [`Logo ${i + 1}`, color]),
    ["Background", n.background],
    ["Surface", n.surface],
    ["Text", n.text],
    ["Muted text", n.muted],
    ["Border", n.border],
    ...(brand.picked || []).map((color, i) => [`Picked ${i + 1}`, color]),
  ].filter(([, color]) => color?.hex);
  rows.forEach(([role, color]) => {
    add(`| ${role} | ${colorName(color)} | \`${color.hex}\` | ${formatRgb(color)} | ${formatHsl(color)} | ${cell((color.roles || []).join(", ") || color.source || "—")} | ${checkLabel(color)} |`);
  });
  add(
    "",
    "Check: **On screen** means the pixel on the live page matched. **Corrected** means the CSS said one value and the screen showed another, so the screen value is used. **Near** means close but not exact (likely an overlay or anti-aliasing). **CSS** means read from computed styles only, because the element was not in the captured viewport.",
    ""
  );

  const corrections = rows.filter(([, color]) => color.cssHex || color.declared);
  if (corrections.length) {
    add("### Corrections from the live page", "");
    corrections.forEach(([role, color]) => {
      if (color.cssHex) add(`- ${role}: CSS computed \`${color.cssHex}\`, the screen renders \`${color.hex}\`. Use \`${color.hex}\`.`);
      if (color.declared) add(`- ${role}: \`${color.declared.name}\` declares \`${color.declared.hex}\`, the page renders \`${color.hex}\`. Use \`${color.hex}\`.`);
    });
    add("");
  }
  if (c.unused?.length) {
    add("### Declared but not used on this page", "", "These CSS tokens exist but nothing visible uses them. Don't treat them as brand colors.", "");
    c.unused.forEach((token) => add(`- \`${token.name}\`: \`${token.hex}\``));
    add("");
  }

  add("### Proportion", "");
  add(
    `- About 60% ${sw(n.background)}${n.surface ? ` and ${sw(n.surface)}` : ""}, 30% text and neutrals, 10% ${accent ? sw(accent) : "accent"}.`,
    "- Secondary and tertiary are highlights: under 5% of any layout each.",
    accent ? `- ${colorName(accent)} marks the main action and key emphasis. One ${colorName(accent).toLowerCase()} action per view.` : "- The site is monochrome. Create emphasis with weight, size, and space, not new colors.",
    look.mode === "light"
      ? "- The site is light. Don't invent a dark theme unless asked. If you must, keep the primary and re-check every contrast pair."
      : "- The site is dark. Keep large areas dark; never flip to a light theme by default.",
    ""
  );

  if (accent && n.background) {
    const dark = look.mode === "dark";
    add(
      "### Derived states (calculated, not on the site)",
      "",
      "| State | Hex | How |",
      "|---|---|---|",
      `| Primary hover | \`${mixHex(accent.hex, dark ? "#ffffff" : "#000000", 0.12)}\` | 12% ${dark ? "white" : "black"} |`,
      `| Primary pressed | \`${mixHex(accent.hex, dark ? "#ffffff" : "#000000", 0.22)}\` | 22% ${dark ? "white" : "black"} |`,
      `| Primary tint (tags, highlights) | \`${mixHex(n.background.hex, accent.hex, 0.1)}\` | 10% primary on background |`,
      `| Focus ring | \`${accent.hex}\` | 2px ring, 2px offset |`,
      ""
    );
  }

  add("### Contrast-safe pairs", "", "**Body text: 4.5:1 or higher**", "");
  listPairs(pairs.text, 10, add);
  add("", "**Large text (24px+, or 19px+ bold) and UI shapes only: 3 to 4.5:1**", "");
  listPairs(pairs.large, 6, add);
  add("", "**Never for text: under 3:1**", "");
  listPairs(pairs.avoid, 6, add);
  add("");

  const chart = [c.primary, c.secondary, c.tertiary, ...(c.extra || []), ...(c.logo || [])].filter((x) => x?.hex);
  add("### Charts and data", "");
  add(
    `- Series order: ${chart.length ? chart.map((x) => `\`${x.hex}\``).join(", ") : "use the text color with tints"}${n.muted ? `, then muted \`${n.muted.hex}\`` : ""}.`,
    `- Gridlines and axes in ${n.border ? `\`${n.border.hex}\`` : "a light neutral"}; labels in ${n.muted ? `\`${n.muted.hex}\`` : "muted text"}.`,
    "- Label series directly. Never rely on color alone; add text, pattern, or shape.",
    "- No 3D, no gradients on data, no pie charts with more than 5 slices.",
    ""
  );

  add("### Gradients", "");
  if (brand.gradients?.length) {
    add("Use these as they are. Don't invent new ones.", "");
    brand.gradients.forEach((gradient) => {
      const parsed = parseGradient(gradient);
      if (!parsed) {
        add(`- \`${gradient}\``);
        return;
      }
      const how = [parsed.kind, parsed.direction].filter(Boolean).join(", ");
      add(`**${how}**`, "", "| Stop | Position |", "|---|---|");
      parsed.stops.forEach((stop) => add(`| \`${stop.hex}\` | ${stop.percent}% |`));
      add("", "How it is written:", "", "```css", parsed.css, "```", "");
    });
  } else {
    add("The site uses no gradients. Keep fills flat.", "");
  }

  add("## 2. Typography", "", "| Role | Family | How it renders | Weights |", "|---|---|---|---|");
  [["Headlines", head], ["Body", body]].forEach(([role, font]) => {
    if (!font?.family) return;
    add(`| ${role} | ${font.family} | ${fontStatus(font)} | ${(font.weights || []).join(", ") || "—"} |`);
  });
  add("");
  if (brand.fonts?.links?.length) {
    add(`Load from: ${brand.fonts.links.map((link) => `<${link}>`).join(", ")}`, "");
  }
  if (head.stack) add(`Fallback stack (headlines): \`${head.stack}\``);
  if (body.stack && body.stack !== head.stack) add(`Fallback stack (body): \`${body.stack}\``);
  add("");

  if (steps.length) {
    add("### Scale on the site (px, as rendered)", "", "| Level | Size | Weight | Line height | Tracking | Case |", "|---|---|---|---|---|---|");
    steps.forEach((s) => add(`| ${s.label} | ${s.size} | ${s.weight} | ${s.lineHeight} | ${s.letterSpacing === "normal" ? "0" : s.letterSpacing} | ${s.transform === "none" ? caseWord : s.transform} |`));
    add("");
    const base = p?.size || 16;
    add(
      "### Scale by medium",
      "",
      "Derived from the site's own ratios between levels, so every medium keeps the same hierarchy.",
      "",
      "| Level | Web desktop (px) | Web mobile (px) | Social, 1080 canvas (px) | Slides (pt) | PDF (pt) |",
      "|---|---|---|---|---|---|"
    );
    steps.forEach((s) => {
      const ratio = s.size / base;
      add(
        `| ${s.label} | ${Math.round(s.size)} | ${Math.round(Math.max(16, s.tag === "p" ? 16 : s.size * 0.62, base * Math.pow(ratio, 0.7)))} | ${scaled(32, ratio, 0.85, 28, 132)} | ${scaled(20, ratio, 0.8, 16, 66)} | ${scaled(10.5, ratio, 0.7, 9, 30, 1)} |`
      );
    });
    add("");
  }
  add(
    "### Type rules",
    "",
    `- Headlines in ${caseWord}, about ${voice.headingWords || 6} words, ${head.family || "the headline font"} at weight ${h1?.weight || "as above"}.`,
    `- Body in ${body.family || "the body font"} at line height ${p?.lineHeight || 1.5}. Lines run 60–75 characters on web, 45–65 in documents.`,
    look.singleFamily ? "- One family does all the work. Create hierarchy with size and weight, never by adding a second family." : `- Two families: ${head.family} for headlines, ${body.family} for reading. Don't swap roles.`,
    "- Only use weights listed above. No faux bold or italics the site doesn't use.",
    h1 && h1.letterSpacing && h1.letterSpacing !== "normal" ? `- Large headlines use tracking of ${h1.letterSpacing}; body text stays at default tracking.` : "- Keep default tracking on body text; tighten only large display sizes, slightly.",
    "- Use tabular figures for prices, stats, and tables. Use real ellipses (…) and curly quotes (“ ”).",
    ""
  );

  add("## 3. Shape, space, and elevation", "");
  add(`- Corners: ${cornerText(look, brand)}`);
  add(`- Spacing scale: ${space.length ? space.map((px) => `${px}`).join(", ") + " px" : "not enough data; use multiples of 8 px"}. Build every gap and padding from these steps.`);
  add(`- Section rhythm: at least ${bigSpace}px between major sections on desktop, about half that on mobile.`);
  add(`- Elevation: ${look.elevation === "flat" ? "flat. Separate surfaces with borders or background shifts, not shadows." : `${look.elevation} shadows, only these:`}`);
  (brand.shadows || []).forEach((s) => add(`  - \`${s}\``));
  if (n.border) add(`- Borders and dividers: 1px \`${n.border.hex}\`.`);
  if (brand.button) {
    const b = brand.button;
    add(
      "",
      "### Primary button",
      "",
      "| Property | Value |",
      "|---|---|",
      `| Label example | “${cell(b.text)}” |`,
      `| Fill | ${b.background ? `\`${b.background.hex}\`` : b.backgroundImage ? "gradient (see code below)" : "none (outline)"} |`,
      `| Text | \`${b.color?.hex}\`, ${b.fontWeight} weight, ${b.fontSize}${b.textTransform && b.textTransform !== "none" ? `, ${b.textTransform}` : ""} |`,
      `| Radius | ${b.radius} |`,
      `| Padding | ${b.padding} |`,
      `| Height | ${b.height}px (keep the tap area at 44px or more) |`,
      `| Border | ${b.border || "none"} |`,
      `| Shadow | ${b.shadow ? `\`${b.shadow}\`` : "none"} |`
    );
    if (b.backgroundImage) add("", "```css", `background: ${b.backgroundImage};`, "```");
  }
  if (brand.buttonSecondary) {
    const s = brand.buttonSecondary;
    add(
      "",
      "### Secondary button",
      "",
      "| Property | Value |",
      "|---|---|",
      `| Label example | “${cell(s.text)}” |`,
      `| Fill | ${s.background ? `\`${s.background.hex}\`` : s.backgroundImage ? "gradient (see code below)" : "none (outline)"} |`,
      `| Text | \`${s.color?.hex}\`, ${s.fontWeight} weight, ${s.fontSize}${s.textTransform && s.textTransform !== "none" ? `, ${s.textTransform}` : ""} |`,
      `| Radius | ${s.radius} |`,
      `| Padding | ${s.padding} |`,
      `| Border | ${s.border || "none"} |`
    );
  }
  add("");

  add("## 4. Voice and messaging", "");
  if (!voice.english) add(`> The page language is \`${copy.lang}\`. The voice measures below are tuned for English; treat them as rough.`, "");
  add(`**Voice in three words:** ${voice.summary}.`, "");
  if (voice.traits.length) {
    add("| Trait | Evidence from the site |", "|---|---|");
    voice.traits.forEach((t) => add(`| ${t.label} | ${cell(t.detail)} |`));
    add("");
  }
  const anchors = [...(copy.h1 || []).slice(0, 1), ...(copy.h2 || []).slice(0, 4)];
  if (anchors.length || copy.ctas?.length) {
    add("### Real lines from the site (tone anchors)", "");
    anchors.forEach((line) => add(`- “${cell(line)}”`));
    if (copy.ctas?.length) add(`- Calls to action: ${copy.ctas.slice(0, 6).map((x) => `“${cell(x)}”`).join(", ")}`);
    add("");
  }
  if (voice.keywords.length) add(`**Words the site repeats:** ${voice.keywords.map((k) => k.word).join(", ")}. Reuse this vocabulary instead of synonyms.`, "");
  add(
    "### Writing rules",
    "",
    `- Sentence length: about ${voice.avgSentence || 14} words, like the site. Vary it; never pad.`,
    voice.youRate >= voice.weRate
      ? "- Talk to the reader as “you”. Lead with what they get, then how."
      : "- The site speaks as “we”. Keep that, but make sure every section says what the reader gets.",
    voice.exclaimRate >= 0.08 ? "- Exclamation marks are part of the voice; at most one per asset." : "- No exclamation marks. Confidence comes from specifics.",
    `- Headlines: ${caseWord}, about ${voice.headingWords || 6} words, outcome first.`,
    `- Calls to action: verb first, 2–4 words${voice.ctaVerbs.length ? `, using the site's verbs (${voice.ctaVerbs.map((v) => v.word).join(", ")})` : ""}. Reuse the site's CTA wording when the action is the same.`,
    `- Avoid clichés: elevate, seamless, unleash, next-gen, game-changer, delve, revolutionize, supercharge, cutting-edge.${voice.cliches.length ? ` The site does use: ${voice.cliches.join(", ")}. Keep those, but don't add more.` : ""}`,
    "- Never invent numbers, customer names, logos, testimonials, or awards. Mark gaps as [needs real data].",
    "- No emoji in headings, buttons, or as icons.",
    ""
  );

  add("### Persuasion that fits this brand", "", "Use these honestly. Each one must be backed by something real.", "");
  levers(voice, look).forEach((line) => add(`- ${line}`));
  add("");

  add(
    "## 5. Landing pages",
    "",
    "### Structure",
    "",
    `1. **Hero.** Headline in brand voice (H1 spec), one-sentence subhead, one primary button${primaryCta ? ` (“${cell(primaryCta)}”)` : ""}, optional secondary text link. Show the product or a real visual, not abstract art.`,
    "2. **Proof.** Logos, numbers, or a quote. Real ones only; leave a [needs real data] slot otherwise.",
    "3. **Value.** Three or four outcomes, each a short heading and one sentence. Prefer an asymmetric grid over three identical cards.",
    "4. **How it works.** Steps or a product walk-through.",
    "5. **Objections.** FAQ separated by 1px borders, no boxed accordions.",
    "6. **Final call to action.** Repeat the primary action with the same wording.",
    "",
    "### Layout",
    "",
    "- Container 1120–1200px; text blocks max 65 characters wide.",
    `- Section padding ${bigSpace}–${bigSpace * 2}px desktop; gaps from the spacing scale.`,
    "- Breakpoints: 375, 768, 1024, 1440. No horizontal scrolling at 375.",
    "- One primary action per view; secondary actions are visually quieter.",
    "",
    "### Interface and accessibility rules",
    "",
    "- Text contrast 4.5:1 (use the safe pairs above); large text and icons 3:1.",
    `- Visible focus state on every control${accent ? ` (2px \`${accent.hex}\` ring)` : ""}. Never remove outlines without a replacement.`,
    "- Buttons for actions, links for navigation. Icon-only controls get an accessible label.",
    "- Touch targets at least 44×44px with 8px between them.",
    "- One H1 per page; headings in order without skipping levels.",
    "- Alt text on meaningful images; set width and height so nothing shifts on load.",
    "- Inputs have visible labels, inline errors next to the field, and autocomplete hints.",
    "- Motion: transform and opacity only, 150–300ms for interface feedback, ease-out on enter. Respect reduced motion.",
    "- Mobile body text at least 16px. Never disable zoom.",
    "- One icon set with one stroke weight. SVG icons, never emoji.",
    ""
  );

  add(
    "## 6. Social media",
    "",
    "| Format | Size (px) | Keep clear |",
    "|---|---|---|",
    "| Square post | 1080 × 1080 | 80px margins |",
    "| Portrait post | 1080 × 1350 | 80px margins |",
    "| Story / Reel / TikTok | 1080 × 1920 | top 220px, bottom 340px |",
    "| Link / landscape | 1200 × 628 | 60px margins |",
    "| LinkedIn banner | 1584 × 396 | left 400px (profile photo) |",
    "",
    "- One message per post. Headline of no more than " + Math.max(6, Math.round((voice.headingWords || 6) + 2)) + ` words, ${caseWord}.`,
    "- Type sizes from the Social column above; nothing under 28px on a 1080 canvas.",
    `- Backgrounds: ${sw(n.background)}${accent ? ` or a full ${sw(accent)} block for announcements` : ""}. Text colors only from the safe pairs.`,
    "- Logo in the same corner on every post, at a consistent size.",
    "- Carousels: slide 1 is the hook, then one point per slide, last slide is the call to action in the site's wording.",
    "- Use the site's own imagery and product shots before stock photography.",
    ""
  );

  add(
    "## 7. Presentations",
    "",
    "- Canvas 16:9 (1920 × 1080px, 13.33 × 7.5in). Margins 96px (about 0.67in), 12-column grid.",
    `- Titles in ${head.family || "the headline font"}, body in ${body.family || "the body font"}; sizes from the Slides column above.`,
    "- Slide types: cover, section divider, one-idea slide, data slide, quote slide, closing call to action.",
    `- Cover: ${accent ? `${sw(accent)} or ` : ""}${sw(n.background)} background, the name in the headline font, nothing else competing.`,
    "- One idea per slide. At most 6 lines and about 40 words of body text.",
    "- Charts use the series order from section 1, labeled directly.",
    "- Speaker notes carry the detail; slides carry the point.",
    ""
  );

  add(
    "## 8. PDF and documents",
    "",
    "- A4 (210 × 297mm) or US Letter. Margins 18–22mm.",
    "- Sizes from the PDF column above; body leading about 1.45.",
    "- Reports: single column. One-pagers: two columns with a clear reading order.",
    `- Body text in ${n.text ? `\`${n.text.hex}\`` : "the text color"}. ${accent ? `Use \`${accent.hex}\` for headings, rules, and highlights; never for long paragraphs unless it passes 4.5:1.` : ""}`,
    "- Header: brand name and document title. Footer: page number and URL.",
    "- Tables: 1px rules in the border color, tabular numbers, no zebra fills heavier than a 4% tint.",
    "- Screen colors here are sRGB. For commercial print, convert to CMYK and proof before sending.",
    ""
  );

  add(
    "## 9. Video and motion",
    "",
    "- Formats: 1920 × 1080 landscape, 1080 × 1920 vertical, 1080 × 1080 square.",
    "- Structure: hook in the first 2 seconds (the main promise, in brand voice) → 2 to 4 value beats, one idea each, 2–4 seconds → proof beat (real numbers only) → end card with the call to action" + (primaryCta ? ` “${cell(primaryCta)}”` : "") + " and the URL.",
    "- On-screen text: headlines at least 48px, supporting text at least 32px on a 1080 canvas; 6% safe margins on every side.",
    `- Captions in ${body.family || "the body font"}, bottom third, on a contrast-safe pair.`,
    `- Motion: enter with ease-out over 400–600ms, exit faster (about 60–70% of the enter time), one focal movement per beat. ${voice.traits.some((t) => t.label === "Energetic") ? "Quick cuts and snappy reveals suit this voice." : "Slow pushes, crossfades, and clean slides suit this calm voice."}`,
    `- Color per beat: ${look.mode === "dark" ? "dark" : "light"} neutral backgrounds, ${accent ? `\`${accent.hex}\`` : "the text color"} for the focal element${look.gradients ? ", the site's gradients for hero moments" : ""}.`,
    `- Music and voice-over mood: ${voice.traits.some((t) => t.label === "Energetic") ? "upbeat and bright" : "warm, calm, unhurried"}.`,
    "- Build from real site visuals (screenshots, product, logo). Check every text frame for contrast and phone-size legibility before delivery.",
    ""
  );

  add(
    "## 10. Before you deliver",
    "",
    "- [ ] Colors only from this file (or its derived states).",
    "- [ ] Every text and background pair is in the safe list.",
    "- [ ] Headline and body fonts, weights, and case match.",
    "- [ ] One primary action per view, worded like the site.",
    "- [ ] No invented numbers, quotes, logos, or awards.",
    "- [ ] No clichés from the avoid list, no emoji as icons.",
    "- [ ] Spacing from the scale; corners and shadows match.",
    "- [ ] Alt text, focus states, 44px targets, reduced motion respected.",
    `- [ ] It would look at home next to the live site${url ? ` (${url})` : ""}.`,
    "- [ ] A designer has had the last look. This file starts a brainstorm or a v1 draft. It is not the final output.",
    ""
  );

  add(
    "## 11. Prompt for AI design tools",
    "",
    "Paste this with your request:",
    "",
    "```text",
    `Design for ${name}${url ? ` (${url})` : ""}. Visual language: ${look.traits.join(", ")}.`,
    `Colors: background ${n.background?.hex || "?"}, text ${n.text?.hex || "?"}${accent ? `, primary ${accent.hex} for the main action and key emphasis only` : ""}${c.secondary ? `, secondary ${c.secondary.hex}` : ""}${c.tertiary ? `, tertiary ${c.tertiary.hex}` : ""}. Only use text/background pairs that pass 4.5:1.`,
    `Type: ${head.family || "?"} for headlines (${caseWord}, weight ${h1?.weight || "?"}), ${body.family || "?"} for body.${brand.button ? ` Buttons: ${brand.button.radius} radius, ${brand.button.fontWeight} weight.` : ""}`,
    `Shape: ${cornerShort(look)}; ${look.elevation === "flat" ? "no shadows" : `${look.elevation} shadows`}; ${look.gradients ? "gradients only as defined" : "no gradients"}.`,
    `Voice: ${voice.summary}. Write like “${cell(copy.h1?.[0] || copy.h2?.[0] || name)}”.${primaryCta ? ` Main call to action: “${cell(primaryCta)}”.` : ""}`,
    "Never invent statistics, testimonials, or logos. Follow brand.md for format-specific rules.",
    "What you generate is a brainstorm or v1 draft, the spark before a designer finishes it.",
    "```",
    ""
  );

  const v = brand.verification;
  add(
    "## Evidence and limits",
    "",
    `- Read from one page: ${url}${brand.viewport ? ` (viewport ${brand.viewport.width} × ${brand.viewport.height})` : ""}.`,
    v?.state === "checked"
      ? `- Screen check: ${v.verified} on screen, ${v.close} near, ${v.corrected} corrected, ${v.unchecked} from CSS only.`
      : "- Screen check: not run (tab wasn't visible). Colors come from computed CSS with transparency and opacity resolved.",
    `- Fonts: ${[head, body].filter((f) => f?.family).map((f) => `${f.family} (${fontStatus(f).toLowerCase()})`).join("; ")}.`,
    "- Not known from one page: colors inside photos (only the logo is sampled), other pages and states, print specs, official logo files and clear-space rules. Ask the brand owner for those.",
    "",
    "Made with ❤️ by [Mubasil](https://mubasil.me) for the 🌍 design community.",
    ""
  );

  return L.join("\n");
}

function levers(voice, look) {
  const out = [];
  const has = (label) => voice.traits.some((t) => t.label === label);
  if (has("Proof-led")) out.push("**Social proof and authority.** The site leads with numbers. Put one real, sourced figure near every claim.");
  else out.push("**Social proof.** Add customer logos, a quote, or a usage number when you have real ones; it does more than adjectives.");
  if (has("Customer-first")) out.push("**Jobs to be done.** Frame every section around the outcome the reader wants, in their words.");
  else out.push("**Jobs to be done.** Translate features into the outcome the reader is hiring the product for.");
  out.push("**Fewer choices (Hick's law).** One primary action per view; three options at most when choice is unavoidable.");
  out.push("**Reciprocity.** Offer something useful before the ask: a guide, a tool, a free tier, a real example.");
  out.push("**Small first step.** Make the first action low-commitment (try, see, start) before asking for more.");
  out.push(has("Energetic") ? "**Urgency, only when real.** Deadlines and limited spots only if they truly exist." : "**No pressure tactics.** The calm voice and fake urgency don't mix; skip countdowns and scarcity badges.");
  out.push("**Strong ending (peak-end rule).** End every asset on one clear next step.");
  if (look.saturation === "vivid") out.push("**Contrast effect.** The vivid accent draws the eye; reserve it for the one thing you want clicked.");
  return out;
}

function listPairs(list, limit, add) {
  if (!list.length) {
    add("- None found.");
    return;
  }
  list.slice(0, limit).forEach((pair) => add(`- ${pair.fgName} \`${pair.fg}\` on ${pair.bgName} \`${pair.bg}\`: ${pair.ratio.toFixed(2)}:1`));
}

function checkLabel(color) {
  const state = color.verification?.state;
  if (color.cssHex || color.declared) return "Corrected";
  if (state === "verified") return "On screen";
  if (state === "close") return "Near";
  return "CSS";
}

function fontStatus(font) {
  const base = { web: "Web font, loaded", system: "System font", generic: "Browser default", unknown: "Unconfirmed" }[font.status] || "Unconfirmed";
  if (font.declared && font.declared.toLowerCase() !== String(font.family).toLowerCase()) {
    return `${base}; ${font.declared} is declared but doesn't load, so this is what visitors see`;
  }
  return base;
}

function cornerText(look, brand) {
  const radii = (brand.radii || []).map((r) => r.label).join(", ");
  const list = radii ? ` (${radii})` : "";
  if (look.pillButton) return `pill-shaped buttons; other surfaces${list}. Keep large containers modestly rounded, not pill-shaped.`;
  if (look.corners === "sharp") return `sharp${list}. Don't round what the site keeps square.`;
  if (look.corners === "rounded") return `generously rounded${list}.`;
  return `softly rounded${list}.`;
}

function cornerShort(look) {
  if (look.pillButton) return "pill buttons, modest radius elsewhere";
  return `${look.corners} corners`;
}

function scaled(base, ratio, k, min, max, digits = 0) {
  const value = Math.min(max, Math.max(min, base * Math.pow(ratio, k)));
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function cell(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function yaml(text) {
  return JSON.stringify(String(text ?? ""));
}