/**
 * Serves index.html and proxies all third-party API calls so that secrets
 * (OpenRouter + KIE keys) live ONLY in .env on the server, never in the browser.
 *
 *   /extract       loads a URL in headless Chromium and reads the RENDERED page
 *                  (exact computed colors, CSS color vars, fonts, logos, text).
 *   /config        non-secret config (which models are active) for the UI.
 *   /chat          OpenRouter chat-completions proxy (Stage 1 + Stage 2).
 *   /kie/generate  KIE GPT-Image-2 image-to-image task creation (Stage 3).
 *   /kie/result    KIE task polling (Stage 3).
 */
const fs = require("fs");
const path = require("path");
const express = require("express");
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

// ── Minimal .env loader (no dependency). Real process.env wins over the file. ──
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (e) {
    // No .env file — rely on real environment variables.
  }
}
loadEnv();

// Server-side Supabase client (service role — bypasses RLS). Used to verify
// user tokens and to write ads/storage on the user's behalf.
const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// Gate the cost-incurring endpoints: caller must present a valid Supabase
// access token AND be approved. Prevents bypassing the browser gate.
async function requireApprovedUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase is not configured on the server (.env)." });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Not signed in." });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles").select("approved").eq("id", userData.user.id).single();
  if (profErr || !profile || !profile.approved) {
    return res.status(403).json({ error: "Your account is awaiting approval." });
  }

  req.user = userData.user;
  next();
}

const app = express();
// Base64 images (reference ad, logo, Stage 2 vision input) make request bodies large.
app.use(express.json({ limit: "25mb" }));
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

app.post("/extract", requireApprovedUser, async (req, res) => {
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

// ── Non-secret config so the UI can show which models are active. ──
app.get("/config", (req, res) => {
  res.json({
    stage1Model: process.env.STAGE1_MODEL || "",
    stage2Model: process.env.STAGE2_MODEL || "",
    kieModel: process.env.KIE_IMAGE_MODEL || "",
    kieResolution: process.env.KIE_IMAGE_RESOLUTION || "1K",
    openrouterConfigured: !!process.env.OPENROUTER_API_KEY,
    kieConfigured: !!process.env.KIE_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  });
});

// ── OpenRouter proxy. Model is pinned per-stage from .env; key never leaves the server. ──
app.post("/chat", requireApprovedUser, async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: "OPENROUTER_API_KEY is not set in .env" } });

  const { stage, messages, online } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: { message: "messages array is required" } });

  let model = Number(stage) === 2 ? process.env.STAGE2_MODEL : process.env.STAGE1_MODEL;
  if (!model) return res.status(500).json({ error: { message: "Model for stage " + stage + " is not set in .env" } });
  // Stage 1 can opt into web search via :online. Stage 2 sends an image, where :online conflicts.
  if (online && Number(stage) !== 2 && !model.endsWith(":online")) model += ":online";

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    // Forward OpenRouter's response verbatim so the client reads the usual shape.
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: { message: e.message || String(e) } });
  }
});

// Upload a base64 image to KIE and return a public URL it can fetch (temp, 3 days).
async function kieUploadBase64(apiKey, base64Data, fileName) {
  // The base64-upload service is hosted on kieai.redpandaai.co — api.kie.ai 404s for this path.
  const r = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ base64Data, uploadPath: "images/ad-stage3", fileName }),
  });
  let data;
  try { data = await r.json(); } catch (e) { data = null; }
  const url = data && data.data && data.data.downloadUrl;
  if (!r.ok || !url) {
    throw new Error("image upload failed: " + ((data && (data.msg || data.message)) || "HTTP " + r.status));
  }
  return url;
}

// ── KIE Stage 3: image-to-image generation from the Stage 2 prompt + reference ad + logo. ──
app.post("/kie/generate", requireApprovedUser, async (req, res) => {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "KIE_API_KEY is not set in .env" });

  const model = process.env.KIE_IMAGE_MODEL || "gpt-image-2-image-to-image";
  let { prompt, referenceImage, logoImage, aspect_ratio, resolution } = req.body || {};
  if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: "prompt is required" });
  if (!referenceImage) return res.status(400).json({ error: "reference image is required" });
  if (!logoImage) return res.status(400).json({ error: "brand logo is required" });

  resolution = resolution || process.env.KIE_IMAGE_RESOLUTION || "1K";
  aspect_ratio = aspect_ratio || "auto";
  if (aspect_ratio === "1:1" && resolution === "4K") resolution = "2K"; // KIE forbids this combo

  try {
    // Reference ad first, brand logo second.
    const input_urls = [
      await kieUploadBase64(apiKey, referenceImage, "reference.png"),
      await kieUploadBase64(apiKey, logoImage, "logo.png"),
    ];
    const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: { prompt: String(prompt).slice(0, 20000), input_urls, aspect_ratio, resolution },
      }),
    });
    let data;
    try { data = await r.json(); } catch (e) { data = null; }
    const taskId = data && data.data && data.data.taskId;
    if (!r.ok || (data && data.code !== 200) || !taskId) {
      return res.status(502).json({ error: (data && (data.msg || data.message)) || "KIE createTask HTTP " + r.status });
    }
    res.json({ taskId });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// ── KIE Stage 3 polling. ──
app.get("/kie/result", requireApprovedUser, async (req, res) => {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "KIE_API_KEY is not set in .env" });

  const taskId = String(req.query.taskId || "");
  if (!taskId) return res.status(400).json({ error: "taskId is required" });

  try {
    const r = await fetch("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(taskId), {
      headers: { Authorization: "Bearer " + apiKey },
    });
    let data;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok || (data && data.code !== 200)) {
      return res.status(502).json({ error: (data && (data.msg || data.message)) || "KIE recordInfo HTTP " + r.status });
    }
    const d = (data && data.data) || {};
    let urls = [];
    if (d.resultJson) {
      try {
        const p = JSON.parse(d.resultJson);
        urls = p.resultUrls || p.result_urls || [];
      } catch (e) {}
    }
    res.json({ state: d.state || "", progress: d.progress, urls, failMsg: d.failMsg || d.failCode || "" });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// ── Persist a generated ad: download the (temporary) KIE image, store it in
//    Supabase Storage under the user's folder, and insert an `ads` row. ──
app.post("/library/ads", requireApprovedUser, async (req, res) => {
  const { imageUrl, brandId, websiteUrl, prompt, aspectRatio, resolution } = req.body || {};
  if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return res.status(502).json({ error: "Could not download image (HTTP " + imgRes.status + ")" });
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    const adId = require("crypto").randomUUID();
    const path = req.user.id + "/" + adId + "." + ext;

    const up = await supabaseAdmin.storage.from("ads").upload(path, buffer, { contentType, upsert: false });
    if (up.error) return res.status(502).json({ error: "Storage upload failed: " + up.error.message });

    const ins = await supabaseAdmin
      .from("ads")
      .insert({
        id: adId,
        user_id: req.user.id,
        brand_id: brandId || null,
        website_url: websiteUrl || null,
        image_path: path,
        prompt: prompt || null,
        aspect_ratio: aspectRatio || null,
        resolution: resolution || null,
      })
      .select()
      .single();
    if (ins.error) return res.status(502).json({ error: "Saving record failed: " + ins.error.message });

    res.json({ ad: ins.data });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
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

start(Number(process.env.PORT) || 3000, 20);
