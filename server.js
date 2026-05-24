/**
 * Serves index.html and exposes POST /extract.
 *
 * /extract loads a URL in a real headless Chromium browser and reads the
 * RENDERED page: exact computed colors, CSS color variables, fonts, logos,
 * and readable text. These exact values are what ground the LLM so it stops
 * guessing hex codes.
 */
const path = require("path");
const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname)); // serves index.html at /

// Launch one browser and reuse it across requests.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

// This function runs INSIDE the page (browser context), not in Node.
function extractFromPage() {
  const toHex = (c) => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    const a = p[3];
    if (a !== undefined && a < 0.1) return null; // skip near-transparent
    const h = (n) => Math.round(n).toString(16).padStart(2, "0");
    return "#" + h(p[0]) + h(p[1]) + h(p[2]);
  };

  const counts = { text: {}, background: {}, border: {}, accent_cta: {} };
  const bump = (obj, hex, w) => {
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

  const top = (obj, n) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n || 8)
      .map(([hex, count]) => ({ hex, count }));

  // CSS custom properties that hold color values (often the real brand tokens).
  const cssVars = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (e) {
      continue; // cross-origin stylesheet, can't read
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (!rule.style) continue;
      for (let i = 0; i < rule.style.length; i++) {
        const prop = rule.style[i];
        if (prop.startsWith("--")) {
          const val = rule.style.getPropertyValue(prop).trim();
          if (/#[0-9a-f]{3,8}\b|rgb|hsl/i.test(val) && !cssVars[prop]) cssVars[prop] = val;
        }
      }
    }
  }

  const fontOf = (sel) => {
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

app.post("/extract", async (req, res) => {
  const url = (req.body && req.body.url ? String(req.body.url) : "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Provide a valid http(s) URL." });
  }

  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const page = await context.newPage();
    // Don't wait for "networkidle": many sites (analytics, ads, websockets) never go
    // idle and would time out. The DOM + load event is all we need for computed styles.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}); // tolerate slow/never-firing load
    await page.waitForTimeout(2000); // let late styles/fonts settle

    const data = await page.evaluate(extractFromPage);
    data.finalUrl = page.url();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

// Start on the desired port; if it's busy, try the next one (up to 20 tries).
function start(port, attemptsLeft) {
  const server = app.listen(port, () => {
    console.log("\n  Site analyzer running.");
    console.log("  Open  ->  http://localhost:" + port + "\n");
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log("  Port " + port + " is busy, trying " + (port + 1) + "…");
      start(port + 1, attemptsLeft - 1);
    } else {
      console.error("  Could not start server:", err.message);
      process.exit(1);
    }
  });
}

start(Number(process.env.PORT) || 8787, 20);
