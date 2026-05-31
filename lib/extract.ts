// extractFromPage runs INSIDE the page (browser context), not in Node. It is
// passed to Playwright's page.evaluate() by the /extract route. Keep it
// self-contained — no Node/imports referenced in the body, since it is
// serialized and executed in the browser. Ported from server.js extractFromPage.

type ColorCount = { hex: string; count: number };

export type ExtractResult = {
  title: string;
  description: string;
  colors: {
    text: ColorCount[];
    background: ColorCount[];
    border: ColorCount[];
    accent_cta: ColorCount[];
  };
  cssColorVariables: Record<string, string>;
  fonts: { body: string | null; heading: string | null; button: string | null };
  logos: string[];
  text: string;
  finalUrl?: string;
};

export function extractFromPage(): ExtractResult {
  const toHex = (c: string | null): string | null => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    const a = p[3];
    if (a !== undefined && a < 0.1) return null; // skip near-transparent
    const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return "#" + h(p[0]) + h(p[1]) + h(p[2]);
  };

  const counts: Record<"text" | "background" | "border" | "accent_cta", Record<string, number>> = {
    text: {}, background: {}, border: {}, accent_cta: {},
  };
  const bump = (obj: Record<string, number>, hex: string | null, w?: number) => {
    if (!hex) return;
    obj[hex] = (obj[hex] || 0) + (w || 1);
  };

  const els = Array.from(document.querySelectorAll("*"));
  for (const el of els) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const areaWeight = Math.max(1, Math.round((Math.max(0, r.width) * Math.max(0, r.height)) / 2000));

    bump(counts.text, toHex(cs.color), 1);
    bump(counts.background, toHex(cs.backgroundColor), areaWeight);
    bump(counts.border, toHex(cs.borderTopColor), 1);

    const tag = el.tagName.toLowerCase();
    const cls = (el.className && el.className.toString ? el.className.toString() : "").toLowerCase();
    const isCta = tag === "button" || (tag === "a" && /btn|button|cta|primary|signup|sign-up|get-started|try/.test(cls)) || /btn|button|cta/.test(cls);
    if (isCta) bump(counts.accent_cta, toHex(cs.backgroundColor), 3);
    if (cs.fill && cs.fill !== "none") bump(counts.accent_cta, toHex(cs.fill), 1);
  }

  const top = (obj: Record<string, number>, n?: number): ColorCount[] =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n || 8)
      .map(([hex, count]) => ({ hex, count }));

  // CSS custom properties that hold color values (often the real brand tokens).
  const cssVars: Record<string, string> = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet, can't read
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const styleRule = rule as CSSStyleRule;
      if (!styleRule.style) continue;
      for (let i = 0; i < styleRule.style.length; i++) {
        const prop = styleRule.style[i];
        if (prop.startsWith("--")) {
          const val = styleRule.style.getPropertyValue(prop).trim();
          if (/#[0-9a-f]{3,8}\b|rgb|hsl/i.test(val) && !cssVars[prop]) cssVars[prop] = val;
        }
      }
    }
  }

  const fontOf = (sel: string): string | null => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : null;
  };

  const logos = Array.from(document.querySelectorAll("img"))
    .filter((i) => /logo|brand/i.test((i.src || "") + " " + (i.alt || "") + " " + (i.className || "")))
    .map((i) => i.src)
    .filter((s, idx, arr) => s && arr.indexOf(s) === idx)
    .slice(0, 6);

  const metaDesc = document.querySelector('meta[name="description"]');

  return {
    title: document.title || "",
    description: metaDesc ? metaDesc.getAttribute("content") || "" : "",
    colors: {
      text: top(counts.text, 6),
      background: top(counts.background, 6),
      border: top(counts.border, 5),
      accent_cta: top(counts.accent_cta, 6),
    },
    cssColorVariables: cssVars,
    fonts: { body: fontOf("body"), heading: fontOf("h1") || fontOf("h2"), button: fontOf("button") || fontOf("a") },
    logos,
    text: (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000),
  };
}
