export function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}
export function parseJsonLoose(s: string): unknown {
  const cleaned = stripFences(s);
  try {
    return JSON.parse(cleaned);
  } catch {}
  const a = cleaned.indexOf("{"),
    b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
  throw new Error("no JSON object found in response");
}
export function mapAspectRatio(ar?: string): string {
  if (!ar) return "auto";
  const s = String(ar).trim();
  if (["1:1", "16:9", "9:16", "4:3", "3:4"].includes(s)) return s;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const r = parseFloat(m[1]) / parseFloat(m[2]);
    if (!isFinite(r) || r <= 0) return "auto";
    if (Math.abs(r - 1) < 0.05) return "1:1";
    if (r > 1) return r >= 1.55 ? "16:9" : "4:3";
    return r <= 0.62 ? "9:16" : "3:4";
  }
  return "auto";
}

// Runs inside the page (browser context) via page.evaluate — not in Node.
export function extractFromPage() {
  const toHex = (c: string | null) => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    const a = p[3];
    if (a !== undefined && a < 0.1) return null; // skip near-transparent
    const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return "#" + h(p[0]) + h(p[1]) + h(p[2]);
  };

  const counts: Record<string, Record<string, number>> = { text: {}, background: {}, border: {}, accent_cta: {} };
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

  const top = (obj: Record<string, number>, n?: number) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n || 8)
      .map(([hex, count]) => ({ hex, count }));

  // CSS custom properties that hold color values (often the real brand tokens).
  const cssVars: Record<string, string> = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch (e) {
      continue; // cross-origin stylesheet, can't read
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const style = (rule as CSSStyleRule).style;
      if (!style) continue;
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        if (prop.startsWith("--")) {
          const val = style.getPropertyValue(prop).trim();
          if (/#[0-9a-f]{3,8}\b|rgb|hsl/i.test(val) && !cssVars[prop]) cssVars[prop] = val;
        }
      }
    }
  }

  const fontOf = (sel: string) => {
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
