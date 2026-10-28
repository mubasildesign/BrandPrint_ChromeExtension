(function brandGuideExtract() {
  const FLAG = "__BRAND_GUIDE_EXTRACT__";
  const ROLE_RANK = { primary: 3, secondary: 2, tertiary: 1 };
  const GENERIC_FAMILIES = new Set([
    "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif",
    "ui-serif", "ui-monospace", "ui-rounded", "-apple-system", "blinkmacsystemfont", "emoji", "math",
  ]);

  function extractBrand() {
    if (!document.body) throw new Error("This page has no body.");

    const view = document.defaultView || window;
    const root = document.documentElement;
    const vw = root.clientWidth || view.innerWidth;
    const vh = root.clientHeight || view.innerHeight;
    const styleCache = new Map();
    const css = (el) => {
      let style = styleCache.get(el);
      if (!style) {
        style = view.getComputedStyle(el);
        styleCache.set(el, style);
      }
      return style;
    };

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const colorCache = new Map();

    function toRgba(input) {
      const value = String(input || "").trim();
      if (!value || value === "transparent" || value === "none" || /^currentcolor$/i.test(value)) return null;
      if (colorCache.has(value)) return colorCache.get(value);
      let out = parseRgb(value);
      if (!out && ctx && !/^var\(/i.test(value)) {
        ctx.fillStyle = "rgba(1, 2, 3, 0.004)";
        const sentinel = ctx.fillStyle;
        ctx.fillStyle = value;
        if (ctx.fillStyle !== sentinel) {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          out = d[3] ? { r: d[0], g: d[1], b: d[2], a: d[3] / 255 } : null;
        }
      }
      colorCache.set(value, out || null);
      return out || null;
    }

    const ownBg = (el) => {
      const color = toRgba(css(el).backgroundColor);
      return color && color.a > 0.01 ? color : null;
    };

    const hasGradientFill = (style) => /gradient\(/i.test(style.backgroundImage || "");

    const stackCache = new Map();
    function stackBg(el) {
      if (!el || el.nodeType !== 1) return { r: 255, g: 255, b: 255 };
      if (stackCache.has(el)) return stackCache.get(el);
      const layer = ownBg(el);
      let out;
      if (layer && layer.a >= 0.995) out = solid(layer);
      else {
        const below = stackBg(el.parentElement);
        out = layer ? over(layer, below) : below;
      }
      stackCache.set(el, out);
      return out;
    }

    const fadeCache = new Map();
    function fade(el) {
      if (fadeCache.has(el)) return fadeCache.get(el);
      let p = 1;
      let top = null;
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        const opacity = parseFloat(css(node).opacity);
        if (opacity < 1) {
          p *= opacity;
          top = node;
        }
      }
      const out = { p, top };
      fadeCache.set(el, out);
      return out;
    }

    function renderedBg(el) {
      const base = stackBg(el);
      const { p, top } = fade(el);
      if (p >= 0.99 || !top) return base;
      return over({ ...base, a: p }, stackBg(top.parentElement));
    }

    function renderedFg(el) {
      const fg = toRgba(css(el).color);
      if (!fg) return null;
      const alpha = fg.a * fade(el).p;
      return alpha >= 0.995 ? solid(fg) : over({ ...fg, a: alpha }, renderedBg(el));
    }

    function rememberHiddenFill(el) {
      const style = css(el);
      if (style.display === "none" || style.visibility === "hidden" || el.closest("[hidden]")) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 40 || rect.right < -20 || rect.left > vw + 20) return;
      const layer = ownBg(el);
      if (!layer || layer.a < 0.85) return;
      const areaWeight = Math.min(((rect.width * rect.height) / viewportArea) * 16, 7);
      use(solid(layer), 2 + areaWeight, "surface");
    }

    function isVisible(el) {
      const style = css(el);
      if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      return fade(el).p > 0.05;
    }

    const buckets = [];
    function bucketFor(color) {
      const neutral = isNeutral(color);
      const limit = neutral ? 9 : 12;
      let best = null;
      let bestDist = limit;
      for (const bucket of buckets) {
        if (bucket.neutral !== neutral) continue;
        const d = dist(bucket.color, color);
        if (d < bestDist) {
          best = bucket;
          bestDist = d;
        }
      }
      if (!best) {
        best = { color, weight: 0, top: 0, roles: new Set(), neutral, probes: [], hint: null, near: null };
        buckets.push(best);
      }
      return best;
    }

    function use(color, weight, role) {
      if (!color || weight <= 0) return null;
      const bucket = bucketFor(color);
      if (weight > bucket.top) {
        bucket.top = weight;
        bucket.color = color;
      }
      bucket.weight += weight;
      if (role) bucket.roles.add(role);
      return bucket;
    }

    function probePoint(el, color) {
      const rect = el.getBoundingClientRect();
      const style = css(el);
      if (style.backgroundImage !== "none") return null;
      const bl = parseFloat(style.borderLeftWidth) || 0;
      const bt = parseFloat(style.borderTopWidth) || 0;
      const pl = parseFloat(style.paddingLeft) || 0;
      const pt = parseFloat(style.paddingTop) || 0;
      let x;
      let y;
      if (pl >= 6) {
        x = rect.left + bl + pl / 2;
        y = rect.top + rect.height / 2;
      } else if (pt >= 6) {
        x = rect.left + rect.width / 2;
        y = rect.top + bt + pt / 2;
      } else if (rect.width >= 40 && rect.height >= 40 && !el.textContent.trim()) {
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else {
        return null;
      }
      return validPoint(x, y, el, color);
    }

    function validPoint(x, y, owner, color) {
      if (x < 2 || y < 2 || x > vw - 3 || y > vh - 3) return null;
      const hit = document.elementFromPoint(x, y);
      if (!hit) return null;
      if (owner && hit !== owner && !owner.contains(hit)) return null;
      if (hit instanceof SVGElement || /^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|INPUT|TEXTAREA)$/i.test(hit.tagName)) return null;
      if (css(hit).backgroundImage !== "none") return null;
      if (dist(renderedBg(hit), color) > 6) return null;
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    function addProbe(bucket, el) {
      if (!bucket || bucket.probes.length >= 3) return;
      const point = probePoint(el, bucket.color);
      if (point) bucket.probes.push(point);
    }

    const spaceCounts = new Map();
    const radiusCounts = new Map();
    const shadowCounts = new Map();
    const gradientCounts = new Map();
    const contrastPairs = [];
    const seenPairs = new Set();
    const buttons = [];

    const pageSamples = [];
    for (const fy of [0.22, 0.4, 0.58, 0.76, 0.92]) {
      for (const x of [4, vw - 6]) {
        const y = Math.round(vh * fy);
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit instanceof SVGElement || css(hit).backgroundImage !== "none") continue;
        pageSamples.push({ x, y, color: renderedBg(hit) });
      }
    }
    const pageBg = modeColor(pageSamples.map((item) => item.color)) || stackBg(document.body);
    const bgBucket = use(pageBg, 40, "background");
    pageSamples
      .filter((item) => dist(item.color, pageBg) <= 4)
      .slice(0, 4)
      .forEach((item) => bgBucket.probes.push({ x: item.x, y: item.y }));

    const scanSelector = [
      "header", "nav", "main", "section", "article", "aside", "footer", "div", "li", "form",
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button", "[role='button']",
      "input[type='submit']", "input[type='button']", "label", "small", "figcaption", "time", "span",
    ].join(",");

    const bodySize = parseFloat(css(document.body).fontSize) || 16;
    const viewportArea = Math.max(vw * vh, 1);
    let scanned = 0;
    let processed = 0;

    for (const el of document.body.querySelectorAll(scanSelector)) {
      scanned += 1;
      if (scanned > 5000 || processed > 1800) break;
      if (!isVisible(el)) {
        rememberHiddenFill(el);
        continue;
      }
      processed += 1;

      const style = css(el);
      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const areaWeight = Math.min(((rect.width * rect.height) / viewportArea) * 20, 8);
      const layer = ownBg(el);
      const filled = Boolean(layer) || hasGradientFill(style);
      const button = isButton(el, style, filled);
      const hasText = directText(el);

      if (layer) {
        const color = layer.a >= 0.92 ? solid(layer) : renderedBg(el);
        let role = "surface";
        let weight = 1 + areaWeight;
        if (button) {
          role = "button";
          weight = 12 + areaWeight;
        } else if (el.closest("header, nav") && rect.width > vw * 0.5) {
          role = "nav";
          weight = 5 + areaWeight;
        }
        const bucket = use(color, weight, role);
        addProbe(bucket, el);
      }

      if (hasText) {
        const fg = renderedFg(el);
        if (fg) {
          if (tag === "a" && !button) use(fg, 4, "link");
          else if (/^h[1-6]$/.test(tag)) use(fg, 3, "heading");
          else if (button) use(fg, 1, "button-text");
          else {
            const size = parseFloat(style.fontSize) || bodySize;
            const muted = /^(small|figcaption|time|label)$/.test(tag) || size < bodySize * 0.92;
            use(fg, 1, muted ? "muted" : "text");
          }
        }
      }

      const border = sideBorder(style);
      if (border) {
        const color = toRgba(border.color);
        if (color && color.a > 0.1) use(over(color, renderedBg(el)), 1.5, "border");
      }

      splitTop(style.backgroundImage).forEach((part) => {
        if (!part.includes("gradient(") || part.length > 600) return;
        gradientCounts.set(part, (gradientCounts.get(part) || 0) + 1 + areaWeight);
        const behind = renderedBg(el);
        gradientStops(part).forEach((stop) => {
          const color = toRgba(stop);
          if (color && color.a > 0.3) use(over(color, behind), 3 + areaWeight / 2, "gradient");
        });
      });

      const shaped = layer || border || button || style.boxShadow !== "none";
      if (shaped || /^(section|main|article|header|footer)$/.test(tag)) {
        ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "rowGap", "columnGap"].forEach((prop) => {
          rememberSize(spaceCounts, style[prop]);
        });
      }
      if (/^(h[1-6]|p|ul|ol)$/.test(tag)) {
        rememberSize(spaceCounts, style.marginTop);
        rememberSize(spaceCounts, style.marginBottom);
      }
      if (shaped) {
        const radius = radiusToken(style, rect);
        if (radius) radiusCounts.set(radius, (radiusCounts.get(radius) || 0) + 1);
        if (style.boxShadow && style.boxShadow !== "none" && style.boxShadow.length < 400) {
          shadowCounts.set(style.boxShadow, (shadowCounts.get(style.boxShadow) || 0) + 1);
        }
      }

      if (button) buttons.push({ el, style, layer, filled, area: rect.width * rect.height });

      if (hasText && (/^h[1-6]$/.test(tag) || tag === "p" || tag === "a" || button)) {
        const fg = renderedFg(el);
        const bg = renderedBg(el);
        if (fg) {
          const label = labelFor(el, button);
          const key = `${hex(fg)}|${hex(bg)}|${label}`;
          if (!seenPairs.has(key)) {
            seenPairs.add(key);
            contrastPairs.push({
              label,
              fg: pack(fg),
              bg: pack(bg),
              size: round1(parseFloat(style.fontSize)),
              weight: style.fontWeight,
              order: pairOrder(label),
            });
          }
        }
      }
    }

    let fills = 0;
    for (const node of document.querySelectorAll("header svg *, nav svg *, [class*='logo' i] svg *")) {
      if (fills > 80) break;
      fills += 1;
      const style = css(node);
      const fill = toRgba(style.fill);
      if (fill && fill.a > 0.5 && node.getBoundingClientRect().width > 1) {
        use(over(fill, renderedBg(node.ownerSVGElement || node)), 6, "logo");
      }
    }

    const tokens = collectTokens();
    const theme = toRgba(document.querySelector('meta[name="theme-color"]')?.getAttribute("content"));
    if (theme) tokens.push({ name: "meta theme-color", color: solid(theme), role: "primary", hex: hex(theme) });

    const usedChromatic = buckets.filter((b) => !b.neutral && b.weight >= 2);
    const unused = [];
    tokens.forEach((token) => {
      if (isNeutral(token.color)) return;
      let exact = null;
      let exactDist = 13;
      let near = null;
      let nearDist = 49;
      usedChromatic.forEach((bucket) => {
        const d = dist(bucket.color, token.color);
        if (d < exactDist) {
          exact = bucket;
          exactDist = d;
        }
        if (d < nearDist && hueGap(bucket.color, token.color) < 22) {
          near = bucket;
          nearDist = d;
        }
      });
      const target = exact || (token.role ? near : null);
      if (target && token.role) {
        if (!target.hint || ROLE_RANK[token.role] > ROLE_RANK[target.hint.role]) {
          target.hint = { role: token.role, name: token.name, hex: token.hex };
        }
        if (!exact) target.near = { name: token.name, hex: token.hex };
      } else if (!target && token.role) {
        unused.push({ name: token.name, hex: token.hex });
      }
    });

    const ranked = usedChromatic
      .map((bucket) => ({
        bucket,
        score: bucket.weight + (bucket.roles.has("surface") ? 6 : 0) + (bucket.roles.has("button") ? 4 : 0) + (bucket.hint ? 8 + ROLE_RANK[bucket.hint.role] * 4 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.bucket);

    const taken = new Set();
    function claim(role) {
      const named = ranked.find((bucket) => !taken.has(bucket) && bucket.hint?.role === role);
      const next = named || ranked.find((bucket) => !taken.has(bucket));
      if (!next) return null;
      taken.add(next);
      return packBucket(next, role);
    }

    const primary = claim("primary");
    const secondary = claim("secondary");
    const tertiary = claim("tertiary");
    const extra = ranked
      .filter((bucket) => !taken.has(bucket) && bucket.weight >= 2)
      .slice(0, 8)
      .map((bucket) => packBucket(bucket, "extra"));

    const neutrals = buckets.filter((b) => b.neutral).sort((a, b) => b.weight - a.weight);
    const paragraph = pickParagraph(visibleAll("p", 60));
    const textColor = (paragraph && renderedFg(paragraph)) || renderedFg(document.body) || { r: 17, g: 17, b: 17 };
    const pickNeutral = (test) => neutrals.find((b) => test(b) && dist(b.color, pageBg) > 5);
    const surface = pickNeutral((b) => b.roles.has("surface") && dist(b.color, textColor) > 30);
    const between = (b) => {
      const toBg = contrast(b.color, pageBg);
      return toBg >= 1.8 && contrast(b.color, textColor) >= 1.4 && toBg < contrast(textColor, pageBg);
    };
    const muted =
      pickNeutral((b) => b.roles.has("muted") && between(b)) ||
      pickNeutral((b) => b.roles.has("text") && between(b) && dist(b.color, textColor) > 22);
    const borderBucket = pickNeutral((b) => b.roles.has("border") && b !== surface);

    const typeScale = ["h1", "h2", "h3", "h4", "h5", "h6", "p"].map((tag) => measureType(tag)).filter(Boolean);
    const paraStep = typeScale.find((step) => step.tag === "p");
    const headStep = typeScale.find((step) => step.tag === "h1") || typeScale.find((step) => step.tag !== "p");
    const bodyStack = css(document.body).fontFamily;
    const fontFaces = [];
    const fontLinks = [];
    readFaces(fontFaces);
    document.querySelectorAll('link[rel="stylesheet"], link[rel="preload"]').forEach((link) => {
      if (/^https:\/\/(fonts\.googleapis\.com|use\.typekit\.net)\//i.test(link.href || "")) fontLinks.push(link.href);
    });

    const primaryFont = fontRecord(paraStep?.stack || bodyStack, [paraStep?.weight]);
    const headingFont = fontRecord(headStep?.stack || bodyStack, typeScale.filter((s) => s.tag !== "p").map((s) => s.weight));
    const wanted = new Set([primaryFont.family, headingFont.family].map((name) => name.toLowerCase()));
    const facesCss = fontFaces.filter((block) => faceMatches(block, wanted)).slice(0, 40).join("\n");

    const probes = {};
    const addProbes = (color, bucket) => {
      if (color && bucket?.probes.length) probes[color.hex] = bucket.probes.slice(0, 4);
    };
    const bucketOf = (color) => buckets.find((b) => color && hex(b.color) === color.hex);
    [primary, secondary, tertiary, ...extra].forEach((color) => addProbes(color, bucketOf(color)));
    const background = { ...pack(pageBg), source: "Page background, sampled at the page edges" };
    addProbes(background, bgBucket);
    const surfaceColor = surface ? { ...pack(surface.color), source: "Cards and panels" } : null;
    addProbes(surfaceColor, surface);

    contrastPairs.sort((a, b) => a.order - b.order);
    harvestButtons(buttons);
    const buttonSpecs = dominantButton(buttons);

    return {
      site: readSite(),
      viewport: { width: vw, height: vh, dpr: view.devicePixelRatio || 1 },
      colors: {
        primary,
        secondary,
        tertiary,
        extra,
        logo: [],
        neutrals: {
          background,
          surface: surfaceColor,
          text: { ...pack(textColor), source: "Body text" },
          muted: muted ? { ...pack(muted.color), source: "Secondary text" } : null,
          border: borderBucket ? { ...pack(borderBucket.color), source: "Borders and dividers" } : null,
        },
        unused: unused.slice(0, 6),
      },
      contrast: contrastPairs.slice(0, 10).map(({ order, ...pair }) => pair),
      fonts: {
        primary: primaryFont,
        secondary: headingFont,
        facesCss,
        links: [...new Set(fontLinks)].slice(0, 4),
      },
      typeScale,
      space: clusterSizes(spaceCounts, 4, 160).map((px) => ({ px, label: `${px}px` })),
      radii: clusterSizes(radiusCounts, 2, 10000).map((px) => ({ px, label: px >= 999 ? "Full" : `${px}px` })),
      shadows: topKeys(shadowCounts, 3),
      gradients: topKeys(gradientCounts, 3),
      button: buttonSpecs.primary,
      buttonSecondary: buttonSpecs.secondary,
      copy: readCopy(buttons),
      logoRect: findLogoRect(),
      probes,
    };

    function packBucket(bucket, role) {
      const c = pack(bucket.color);
      c.roles = roleLabels(bucket.roles);
      if (bucket.near) {
        c.declared = { name: bucket.near.name, hex: bucket.near.hex };
        c.source = `CSS declares ${bucket.near.name} as ${bucket.near.hex}, but the page renders ${c.hex}`;
      } else if (bucket.hint && bucket.hint.role === role) {
        c.source = `Declared as ${bucket.hint.name}`;
      } else if (bucket.hint) {
        c.source = `Matches ${bucket.hint.name}`;
      } else {
        c.source = role === "primary" ? "Strongest color on buttons, links, and large areas" : "Next strongest rendered color";
      }
      return c;
    }

    function collectTokens() {
      const names = new Set();
      const rootStyle = css(root);
      for (let i = 0; i < rootStyle.length; i += 1) {
        if (rootStyle[i].startsWith("--")) names.add(rootStyle[i]);
      }
      const walk = (rules, depth) => {
        if (!rules || depth > 6) return;
        for (const rule of rules) {
          try {
            if (rule.style && /(^|,|\s):root|(^|,|\s)html|(^|,|\s)body/i.test(rule.selectorText || "")) {
              for (let i = 0; i < rule.style.length; i += 1) {
                if (rule.style[i].startsWith("--")) names.add(rule.style[i]);
              }
            }
            if (rule.cssRules) walk(rule.cssRules, depth + 1);
          } catch {
            /* unreadable rule */
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules, 0);
        } catch {
          /* cross-origin stylesheet */
        }
      }
      const out = [];
      for (const name of names) {
        if (out.length > 300) break;
        const role = roleFromName(name);
        if (!role) continue;
        const raw = rootStyle.getPropertyValue(name).trim() || css(document.body).getPropertyValue(name).trim();
        const color = toRgba(normalizeToken(raw));
        if (!color || color.a < 0.5) continue;
        out.push({ name, color: solid(color), role, hex: hex(color) });
      }
      return out;
    }

    function measureType(tag) {
      const elements = visibleAll(tag, 50).filter((el) => !el.closest("nav, footer, [role='contentinfo']"));
      const element = tag === "p" ? pickParagraph(elements) : pickHeading(elements);
      if (!element) return null;
      const style = css(element);
      const size = round1(parseFloat(style.fontSize));
      const lineHeightPx = style.lineHeight === "normal" ? size * 1.2 : parseFloat(style.lineHeight);
      const family = renderedFamily(style.fontFamily);
      return {
        tag,
        label: tag === "p" ? "Paragraph" : `Heading ${tag.slice(1)}`,
        family: family.family,
        stack: style.fontFamily,
        size,
        weight: style.fontWeight,
        lineHeight: size ? Math.round((lineHeightPx / size) * 100) / 100 : 1.4,
        letterSpacing: style.letterSpacing,
        transform: style.textTransform,
        color: pack(renderedFg(element) || textColor),
        sample: clean(element.innerText).slice(0, 110),
      };
    }

    function fontRecord(stack, weights) {
      const rendered = renderedFamily(stack);
      return {
        family: rendered.family,
        declared: firstFamily(stack),
        status: rendered.status,
        stack,
        weights: [...new Set((weights || []).filter(Boolean).map(String))].sort(),
      };
    }

    function renderedFamily(stack) {
      const families = splitStack(stack);
      const faces = new Map();
      try {
        document.fonts.forEach((face) => {
          const key = face.family.replace(/["']/g, "").trim().toLowerCase();
          const list = faces.get(key) || [];
          list.push(face.status);
          faces.set(key, list);
        });
      } catch {
        /* FontFaceSet unavailable */
      }
      for (const family of families) {
        const key = family.toLowerCase();
        if (GENERIC_FAMILIES.has(key)) return { family, status: "generic" };
        const states = faces.get(key);
        if (states) {
          if (states.includes("loaded") || states.includes("loading")) return { family, status: "web" };
          continue;
        }
        if (installed(family)) return { family, status: "system" };
      }
      return { family: families[0] || "sans-serif", status: "unknown" };
    }

    function installed(family) {
      if (!ctx) return true;
      const text = "mmmmmmmmmmlliWW@#0";
      for (const fallback of ["monospace", "serif"]) {
        ctx.font = `72px ${fallback}`;
        const base = ctx.measureText(text).width;
        ctx.font = `72px "${family.replace(/"/g, "")}", ${fallback}`;
        if (Math.abs(ctx.measureText(text).width - base) > 0.5) return true;
      }
      return false;
    }

    function readFaces(out) {
      const walk = (rules, depth) => {
        if (!rules || depth > 6) return;
        for (const rule of rules) {
          try {
            if (rule.type === CSSRule.FONT_FACE_RULE) out.push(rule.cssText);
            if (rule.cssRules) walk(rule.cssRules, depth + 1);
          } catch {
            /* unreadable rule */
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules, 0);
        } catch {
          /* cross-origin stylesheet */
        }
      }
    }

    function harvestButtons(list) {
      const have = new Set(list.map((item) => item.el));
      const roots = [document];
      let hosts = 0;
      for (const el of document.querySelectorAll("*")) {
        if (!el.shadowRoot) continue;
        roots.push(el.shadowRoot);
        if (++hosts > 40) break;
      }
      for (const root of roots) {
        const nodes = root.querySelectorAll?.("a, button, [role='button'], input[type='submit'], input[type='button'], [class~='btn'], [class~='button'], [class~='cta']");
        if (!nodes) continue;
        let seen = 0;
        let added = 0;
        for (const el of nodes) {
          if (have.has(el)) continue;
          if (++seen > 4000 || added > 120) break;
          if (!isVisible(el)) continue;
          const style = css(el);
          if (!isButton(el, style)) continue;
          const rect = el.getBoundingClientRect();
          have.add(el);
          added += 1;
          list.push({
            el,
            style,
            layer: ownBg(el),
            filled: solidFill(ownBg(el)) || hasGradientFill(style),
            area: rect.width * rect.height,
          });
        }
      }
    }

    function dominantButton(list) {
      const h1 = document.querySelector("h1");
      const h1Top = h1 ? h1.getBoundingClientRect().top : 120;
      const ranked = [];
      const seen = new Set();
      list.forEach((item) => {
        if (!item?.el || seen.has(item.el)) return;
        seen.add(item.el);
        if (skippedChrome(item.el)) return;
        const text = buttonLabel(item.el);
        if (!text || isUtilityLabel(text)) return;
        const paint = paintNode(item.el);
        const style = css(paint);
        const rect = paint.getBoundingClientRect();
        if (rect.width < 48 || rect.height < 30 || rect.height > 96 || rect.width > 420) return;
        if (rect.bottom < -80 || rect.top > 40000) return;
        const layer = ownBg(paint);
        const gradient = hasGradientFill(style);
        const solid = solidFill(layer) || gradient;
        const outline = !solid && Boolean(sideBorder(style));
        const faint = layer && layer.a >= 0.03 && layer.a < 0.45;
        const ghost = !solid && !outline && (faint || /secondary|outline|ghost/i.test(String(item.el.getAttribute("class") || "")));
        if (!solid && !outline && !ghost && !controlName(item.el) && !controlName(paint)) return;
        let score = solid ? 52 : outline ? 30 : 14;
        if (rect.top >= -8 && rect.top < vh) score += 38;
        else if (rect.top < vh * 2.2) score += 16;
        if (Math.abs(rect.top - h1Top) < 320) score += 24;
        if (controlName(item.el) || controlName(paint)) score += 16;
        if (/^(get |start|try |buy|shop|book|subscribe|download|learn more|contact|talk |request|join |explore|view |apply|sign up|pre-order|order )/i.test(text)) score += 16;
        if (item.el.closest("header, nav") && solid) score += 12;
        if (/\b(issue|inbox|pulse|workspace|emoji|mention|shortcut|filter)\b/i.test(text)) score -= 36;
        score += Math.min(rect.width, 180) / 28;
        score += Math.max(0, 18 - Math.max(rect.top, 0) / 90);
        const bg = gradient && !solidFill(layer) ? "gradient" : solid && layer ? hex(renderedBg(paint)) : solid ? "fill" : outline ? "outline" : "ghost";
        ranked.push({ ...item, paint, text, score, bg, outline, solid, top: rect.top });
      });
      const unique = ranked.filter((item) => !ranked.some((other) => other !== item && item.el.contains(other.el)));
      unique.sort((a, b) => b.score - a.score);
      if (!unique.length) return { primary: null, secondary: null };
      const primary = unique[0];
      const rivals = unique.slice(1).filter((item) => item.bg !== primary.bg || item.outline !== primary.outline);
      rivals.sort((a, b) => {
        const near = (item) => (Math.abs(item.top - primary.top) < 140 ? 28 : 0);
        return b.score + near(b) - (a.score + near(a));
      });
      const secondary = rivals[0] && rivals[0].score >= 28 ? rivals[0] : null;
      return {
        primary: buildButtonSpec(primary),
        secondary: secondary ? buildButtonSpec(secondary) : null,
      };
    }

    function buildButtonSpec(winner) {
      const el = winner.paint || winner.el;
      const style = css(el);
      const layer = ownBg(el);
      const border = sideBorder(style);
      const gradient = !solidFill(layer) && hasGradientFill(style) ? style.backgroundImage : "";
      const fill = solidFill(layer) ? renderedBg(el) : null;
      const glass = !fill && layer && layer.a >= 0.03 && layer.a < 0.45 ? renderedBg(el) : null;
      const rawBorder = border ? toRgba(border.color) : null;
      const borderColor = rawBorder && rawBorder.a >= 0.35 ? over(rawBorder, renderedBg(el)) : null;
      const borderMatchesFill = fill && borderColor && dist(fill, borderColor) < 18;
      return {
        text: winner.text || clean(el.innerText).slice(0, 32) || "Button",
        background: fill ? pack(fill) : glass ? pack(glass) : null,
        backgroundImage: gradient,
        surface: hex(backdrop(el, fill)),
        color: pack(renderedFg(winner.el) || renderedFg(el) || { r: 17, g: 17, b: 17 }),
        radius: style.borderRadius,
        padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
        height: Math.round(el.getBoundingClientRect().height),
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        border: border && borderColor && !borderMatchesFill ? `${border.width} solid ${hex(borderColor)}` : "",
        shadow: style.boxShadow === "none" ? "" : style.boxShadow,
      };
    }

    function backdrop(el, fill) {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const bg = renderedBg(node);
        if (!fill || dist(bg, fill) > 18) return bg;
      }
      return { r: 246, g: 245, b: 242 };
    }

    function solidFill(color) {
      return Boolean(color && color.a >= 0.45);
    }

    function controlName(el) {
      const tokens = String(el?.getAttribute?.("class") || "").split(/\s+/);
      return tokens.some((token) => {
        if (/reset|icon|menu|toggle|close|search|hamburger|nav/i.test(token)) return false;
        return /^(btn|button|cta)([-_].*)?$/i.test(token) || /[-_](btn|cta)$/i.test(token);
      });
    }

    function buttonLabel(el) {
      const raw = clean(el.innerText) || clean(el.getAttribute("aria-label") || "") || clean(el.getAttribute("value") || "");
      const line = raw.split("\n")[0].trim();
      if (line.length <= 32) return line;
      const head = line.split(",")[0].trim();
      return head.length >= 2 && head.length <= 32 ? head : "";
    }

    function isUtilityLabel(text) {
      const value = text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!value || value.length > 32) return true;
      if (/^(menu|main menu|open menu|close|close dialog|search|skip|skip to content|accept|accept all|reject all|cookies?|bag|cart|shopping bag|play|pause|next|previous|prev|share|mute|unmute|toggle|back|filter|sort|account|country|region|select language)$/.test(value)) return true;
      return /\b(menu|cookie|carousel|slider|dialog|modal|locale|shopping bag)\b/.test(value);
    }

    function skippedChrome(el) {
      return Boolean(el.closest("footer, [role='contentinfo'], dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true'], [id*='locale' i], [class*='locale' i], [id*='cookie' i], [class*='cookie' i], [id*='consent' i], [class*='consent' i], [id*='onetrust' i], [class*='onetrust' i]"));
    }

    function paintNode(el) {
      const own = css(el);
      if (solidFill(ownBg(el)) || hasGradientFill(own) || sideBorder(own)) return el;
      for (const child of el.children) {
        const childRect = child.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        if (childRect.width < Math.max(40, rect.width * 0.6) || childRect.height < 24) continue;
        const childStyle = css(child);
        if (solidFill(ownBg(child)) || hasGradientFill(childStyle) || (sideBorder(childStyle) && controlName(child))) return child;
      }
      const parent = el.parentElement;
      if (parent && parent.childElementCount <= 2) {
        const parentRect = parent.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        const parentStyle = css(parent);
        if (parentRect.width <= rect.width + 12 && parentRect.height <= rect.height + 12 && (solidFill(ownBg(parent)) || hasGradientFill(parentStyle) || (controlName(parent) && sideBorder(parentStyle)))) {
          return parent;
        }
      }
      return el;
    }

    function readCopy(buttonList) {
      const description =
        document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
        document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ||
        "";
      const ctas = [];
      const seen = new Set();
      buttonList.forEach((item) => {
        const text = clean(item.el.innerText);
        if (text && text.length <= 40 && !seen.has(text.toLowerCase())) {
          seen.add(text.toLowerCase());
          ctas.push(text);
        }
      });
      return {
        lang: root.lang || "",
        description: description.slice(0, 300),
        h1: texts("h1", 3, 160),
        h2: texts("h2", 10, 160),
        h3: texts("h3", 10, 140),
        ctas: ctas.slice(0, 10),
        nav: texts("header nav a, nav a", 12, 30),
        paragraphs: texts("main p, article p, section p, p", 16, 600).filter((text) => text.length >= 30),
      };
    }

    function texts(selector, limit, maxLen) {
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll(selector)) {
        if (out.length >= limit) break;
        if (!isVisible(el)) continue;
        const text = clean(el.innerText);
        if (!text || text.length > maxLen || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        out.push(text);
      }
      return out;
    }

    function findLogoRect() {
      const candidates = document.querySelectorAll(
        "header a[href='/'] img, header a[href='/'] svg, [class*='logo' i] img, [class*='logo' i] svg, img[alt*='logo' i], header img, header svg, nav img, nav svg"
      );
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 16 || rect.height < 10 || rect.width > vw * 0.5) continue;
        if (rect.top < 0 || rect.bottom > vh || rect.left < 0 || rect.right > vw) continue;
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      }
      return null;
    }

    function readSite() {
      const ogName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
      const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
      const icon = icons.find((item) => /apple-touch-icon/i.test(item.rel)) || icons[icons.length - 1];
      let favicon = "";
      try {
        favicon = icon?.getAttribute("href") ? new URL(icon.getAttribute("href"), location.href).href : new URL("/favicon.ico", location.href).href;
      } catch {
        favicon = "";
      }
      return {
        title: document.title || location.host,
        name: ogName || shortTitle(document.title) || location.host,
        url: location.href,
        host: location.host,
        favicon,
      };
    }

    function visibleAll(selector, limit) {
      const found = [];
      for (const el of document.querySelectorAll(selector)) {
        if (found.length >= limit) break;
        if (isVisible(el)) found.push(el);
      }
      return found;
    }

    function pickHeading(elements) {
      const pool = elements.filter((el) => el.closest("main, article, header, section, [role='main']"));
      return pool[0] || elements[0] || null;
    }

    function pickParagraph(elements) {
      const pool = elements.filter((el) => el.closest("main, article, section, [role='main']"));
      let source = pool.length ? pool : elements;
      const onCanvas = source.filter((el) => {
        const bg = stackBg(el);
        return bg && contrast(bg, pageBg) < 1.25;
      });
      if (onCanvas.length) source = onCanvas;
      const sizes = new Map();
      source.forEach((el) => {
        if (clean(el.innerText).length < 20) return;
        const size = Math.round(parseFloat(css(el).fontSize));
        sizes.set(size, (sizes.get(size) || 0) + 1);
      });
      const common = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (common) source = source.filter((el) => Math.round(parseFloat(css(el).fontSize)) === common);
      return (
        source
          .map((el) => ({ el, length: clean(el.innerText).length }))
          .filter((item) => item.length > 0)
          .sort((a, b) => {
            const fitA = a.length >= 40 && a.length <= 500 ? 1 : 0;
            const fitB = b.length >= 40 && b.length <= 500 ? 1 : 0;
            return fitB - fitA || b.length - a.length;
          })[0]?.el || null
      );
    }

    function isButton(el, style) {
      if (skippedChrome(el)) return false;
      const text = buttonLabel(el);
      if (!text || isUtilityLabel(text)) return false;
      const paint = paintNode(el);
      const paintStyle = paint === el ? style : css(paint);
      const rect = paint.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 30 || rect.height > 96 || rect.width > 420) return false;
      const named = controlName(el) || controlName(paint);
      const tagBtn = el.matches("button, [role='button'], input[type='submit'], input[type='button'], a");
      if (!tagBtn && !named) return false;
      const padX = parseFloat(paintStyle.paddingLeft) || 0;
      const padY = parseFloat(paintStyle.paddingTop) || 0;
      const radius = parseFloat(paintStyle.borderTopLeftRadius) || 0;
      const layer = ownBg(paint);
      const solid = solidFill(layer) || hasGradientFill(paintStyle);
      const border = Boolean(sideBorder(paintStyle));
      const faint = layer && layer.a >= 0.03 && layer.a < 0.45;
      const pill = radius >= 8 && padX >= 14 && rect.height >= 34 && rect.width >= 72 && rect.width <= 320;
      if (solid && (padX >= 8 || padY >= 6 || named)) return true;
      if (border && radius >= 2 && (padX >= 8 || padY >= 6)) return true;
      if (named && (solid || border || padX >= 10 || radius >= 8)) return true;
      if ((faint || /secondary|outline|ghost/i.test(String(el.getAttribute("class") || ""))) && pill) return true;
      return false;
    }
  }

  function directText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length > 1) return true;
    }
    return false;
  }

  function sideBorder(style) {
    for (const side of ["Top", "Bottom", "Left"]) {
      const width = parseFloat(style[`border${side}Width`]);
      if (width >= 1 && style[`border${side}Style`] !== "none" && style[`border${side}Style`] !== "hidden") {
        return { width: `${Math.round(width)}px`, color: style[`border${side}Color`] };
      }
    }
    return null;
  }

  function normalizeToken(raw) {
    const value = String(raw || "").trim();
    if (/^-?[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/.test(value)) return `hsl(${value})`;
    if (/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(value)) return `rgb(${value})`;
    return value;
  }

  function roleFromName(name) {
    const value = name.toLowerCase();
    if (/foreground|on-|hover|active|disabled|focus|ring|shadow|-fg\b|-text\b|contrast/.test(value)) return null;
    if (/tertiary/.test(value)) return "tertiary";
    if (/secondary/.test(value)) return "secondary";
    if (/primary|brand|accent|theme-color/.test(value)) return "primary";
    return null;
  }

  function roleLabels(roles) {
    const map = {
      button: "Buttons",
      link: "Links",
      heading: "Headings",
      nav: "Navigation",
      surface: "Large areas",
      gradient: "Gradients",
      logo: "Logo",
      border: "Borders",
    };
    return [...roles].map((role) => map[role]).filter(Boolean);
  }

  function labelFor(el, button) {
    const tag = el.tagName.toLowerCase();
    if (button) return "Button";
    if (tag === "p") return "Paragraph";
    if (/^h[1-6]$/.test(tag)) return `Heading ${tag.slice(1)}`;
    if (tag === "a") return "Link";
    return tag;
  }

  function pairOrder(label) {
    const order = ["Heading 1", "Heading 2", "Paragraph", "Button", "Link", "Heading 3"];
    const index = order.indexOf(label);
    return index === -1 ? 9 : index;
  }

  function rememberSize(map, value) {
    const px = Math.round(parseFloat(value));
    if (!Number.isFinite(px) || px < 4 || px > 160) return;
    map.set(px, (map.get(px) || 0) + 1);
  }

  function radiusToken(style, rect) {
    const radius = parseFloat(style.borderTopLeftRadius);
    if (!radius || radius < 2) return null;
    const minSide = Math.min(rect.width, rect.height);
    if (minSide > 0 && radius >= minSide / 2 - 1) return 9999;
    return Math.round(radius);
  }

  function clusterSizes(map, min, max) {
    const items = [...map.entries()]
      .map(([px, count]) => ({ px, count }))
      .filter((item) => item.px >= min && item.px <= max)
      .sort((a, b) => a.px - b.px);
    const groups = [];
    items.forEach((item) => {
      const last = groups[groups.length - 1];
      if (last && Math.abs(item.px - last.anchor) <= 2 && item.px < 999) {
        last.count += item.count;
        if (item.count >= last.modeCount) {
          last.px = item.px;
          last.modeCount = item.count;
        }
      } else {
        groups.push({ px: item.px, count: item.count, modeCount: item.count, anchor: item.px });
      }
    });
    return groups
      .sort((a, b) => b.count - a.count)
      .slice(0, 7)
      .sort((a, b) => a.px - b.px)
      .map((item) => item.px);
  }

  function topKeys(map, limit) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
  }

  function gradientStops(value) {
    return value.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) || [];
  }

  function modeColor(colors) {
    let best = null;
    let bestCount = 0;
    colors.forEach((color) => {
      const count = colors.filter((other) => dist(other, color) <= 4).length;
      if (count > bestCount) {
        best = color;
        bestCount = count;
      }
    });
    return best;
  }

  function faceMatches(block, wanted) {
    const match = block.match(/font-family:\s*([^;]+)/i);
    return Boolean(match && wanted.has(match[1].replace(/["']/g, "").trim().toLowerCase()));
  }

  function shortTitle(title) {
    const text = String(title || "").trim();
    const parts = text.split(/\s[|–—-]\s/);
    return (parts[0] || text).trim();
  }

  function parseRgb(value) {
    const match = String(value).match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (!match) return null;
    let alpha = 1;
    if (match[4] != null) alpha = match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
    if (!(alpha > 0)) return null;
    return { r: Math.round(+match[1]), g: Math.round(+match[2]), b: Math.round(+match[3]), a: alpha };
  }

  function solid(color) {
    return { r: color.r, g: color.g, b: color.b };
  }

  function over(top, bottom) {
    const a = top.a == null ? 1 : top.a;
    return {
      r: Math.round(top.r * a + bottom.r * (1 - a)),
      g: Math.round(top.g * a + bottom.g * (1 - a)),
      b: Math.round(top.b * a + bottom.b * (1 - a)),
    };
  }

  function pack(color) {
    return { hex: hex(color), r: color.r, g: color.g, b: color.b, roles: [], source: "" };
  }

  function hex(color) {
    const channel = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
  }

  function hsl(color) {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
  }

  function isNeutral(color) {
    const { s, l } = hsl(color);
    const span = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    if (l <= 0.06 || l >= 0.97) return true;
    if (span <= 12) return true;
    return s < 0.08 && span <= 22;
  }

  function contrast(a, b) {
    const lum = (c) => {
      const ch = (v) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    };
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  function hueGap(a, b) {
    const diff = Math.abs(hsl(a).h - hsl(b).h);
    return Math.min(diff, 360 - diff);
  }

  function dist(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function splitStack(stack) {
    return String(stack || "")
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  function firstFamily(stack) {
    return splitStack(stack)[0] || "sans-serif";
  }

  function splitTop(value) {
    const parts = [];
    let depth = 0;
    let start = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      else if (ch === "," && depth === 0) {
        parts.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
    const last = text.slice(start).trim();
    if (last) parts.push(last);
    return parts.filter((part) => part && part !== "none");
  }

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function round1(n) {
    return Math.round((Number(n) || 0) * 10) / 10;
  }

  window[FLAG] = extractBrand;
})();
