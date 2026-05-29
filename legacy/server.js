/**
 * Serves the customer app (app.html) and proxies all third-party API calls so that secrets
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
const { dailyLimit, generationTz, startOfDayInTz } = require("./usage.js");

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
    .from("profiles").select("approved,is_admin").eq("id", userData.user.id).single();
  if (profErr || !profile || !profile.approved) {
    return res.status(403).json({ error: "Your account is awaiting approval." });
  }

  req.user = userData.user;
  req.profile = profile;
  next();
}

// Count this user's successful generations since the start of the current
// `GENERATION_TZ` day (default Australia/Sydney). Used to enforce the daily cap.
async function generationsToday(userId) {
  const since = startOfDayInTz(generationTz()).toISOString();
  const { count, error } = await supabaseAdmin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count || 0;
}

// Best-effort: log one successful generation. A failure here must not fail the
// already-completed (paid) generation, so we only warn.
async function recordGeneration(userId) {
  const { error } = await supabaseAdmin.from("generations").insert({ user_id: userId });
  if (error) console.error("Failed to record generation for", userId, "-", error.message);
}

const app = express();
// Base64 images (reference ad, logo, Stage 2 vision input) make request bodies large.
app.use(express.json({ limit: "25mb" }));
app.use(express.static(__dirname)); // serves static assets (styles/, assets/, *.js)

// Customer app — the URL→ad workflow (sign in, make-an-ad, library). This is the whole
// product: it's served at / (and /app for back-compat with existing links/bookmarks).
const sendApp = (req, res) => res.sendFile(path.join(__dirname, "app.html"));
app.get("/", sendApp);
app.get("/app", sendApp);

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
    imageBackend: (process.env.IMAGE_BACKEND || "kie").toLowerCase(),
    openrouterImageModel: process.env.OPENROUTER_IMAGE_MODEL || "openai/gpt-5.4-image-2",
    openrouterImageModels: imageModelAllowlist(),
    chatModels: chatModelAllowlist(),
    openrouterConfigured: !!process.env.OPENROUTER_API_KEY,
    kieConfigured: !!process.env.KIE_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  });
});

// ── Daily-cap usage for the signed-in user. Admins are unlimited. ──
app.get("/usage", requireApprovedUser, async (req, res) => {
  const limit = dailyLimit();
  if (req.profile.is_admin) return res.json({ used: 0, limit, isAdmin: true });
  try {
    const used = await generationsToday(req.user.id);
    res.json({ used, limit, isAdmin: false });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// ── OpenRouter proxy. Model is pinned per-stage from .env; key never leaves the server. ──
app.post("/chat", requireApprovedUser, async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: "OPENROUTER_API_KEY is not set in .env" } });

  const { stage, messages, online, model: requestedModel } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: { message: "messages array is required" } });

  let model = Number(stage) === 2 ? process.env.STAGE2_MODEL : process.env.STAGE1_MODEL;
  if (!model) return res.status(500).json({ error: { message: "Model for stage " + stage + " is not set in .env" } });
  // Admin picker may override the pinned default, but only with a model from the server-side
  // allowlist — an arbitrary client-supplied model is ignored (secret-keeping-proxy invariant).
  if (requestedModel && chatModelAllowlist().includes(requestedModel)) model = requestedModel;
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

// Ensure a base64 string is a full data URL (OpenRouter's image_url wants `data:...;base64,`).
function asDataUrl(s) {
  if (!s) return null;
  return String(s).startsWith("data:") ? String(s) : "data:image/png;base64," + s;
}

// OpenRouter image models the admin UI may pick from (comma-separated IDs in .env).
// Acts as a safety bound: /kie/generate only honors a client-supplied model if it's listed here.
function imageModelAllowlist() {
  return String(process.env.OPENROUTER_IMAGE_MODELS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

// OpenRouter chat models the admin UI may pick from for Stage 1 / Stage 2 (comma-separated
// IDs in .env). Same safety bound as images: /chat only honors a client-supplied model if it
// is listed here. The active stage defaults are always force-included so the picker can never
// be missing whatever STAGE1_MODEL / STAGE2_MODEL currently point at.
function chatModelAllowlist() {
  const list = String(process.env.OPENROUTER_CHAT_MODELS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  [process.env.STAGE1_MODEL, process.env.STAGE2_MODEL].forEach((m) => {
    m = (m || "").trim();
    if (m && !list.includes(m)) list.push(m);
  });
  return list;
}

// ── OpenRouter image-to-image (Stage 3 alternative to KIE; selected via IMAGE_BACKEND).
//    One synchronous chat-completions call with modalities:["image","text"]; the model
//    returns the finished image inline as a base64 data URL. No upload host, no polling. ──
async function openrouterGenerateImage(apiKey, model, { prompt, referenceImage, logoImage, productImages, aspect_ratio }) {
  const products = (Array.isArray(productImages) ? productImages : []).filter(Boolean).slice(0, 3);
  const intro =
    "Generate a single finished advertising image. Use the attached images as source material:\n" +
    "1) REFERENCE AD — copy its layout, composition, and visual style.\n" +
    "2) BRAND LOGO — place the brand's real logo as-is; do not redraw or invent a logo.\n" +
    (products.length ? "3+) PRODUCT/UI — feature these exact product visuals; do not invent product UI.\n" : "") +
    "Render an on-brand ad" +
    (aspect_ratio && aspect_ratio !== "auto" ? " with a " + aspect_ratio + " aspect ratio" : "") +
    " following this brief:\n\n";

  const content = [{ type: "text", text: intro + String(prompt || "") }];
  for (const img of [referenceImage, logoImage, ...products]) {
    const url = asDataUrl(img);
    if (url) content.push({ type: "image_url", image_url: { url } });
  }

  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content }] }),
  });
  let data;
  try { data = await r.json(); } catch (e) { data = null; }
  if (!r.ok || (data && data.error)) {
    throw new Error((data && data.error && (data.error.message || data.error)) || "OpenRouter image HTTP " + r.status);
  }
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  const urls = (((msg && msg.images) || []).map((im) => im && im.image_url && im.image_url.url)).filter(Boolean);
  if (!urls.length) {
    throw new Error("Image model returned no image" + (msg && msg.content ? ": " + String(msg.content).slice(0, 200) : "."));
  }
  return urls;
}

// ── Stage 3 image generation. Reachable at /kie/generate for backward compatibility,
//    but the backend is chosen by IMAGE_BACKEND (kie | openrouter). ──
app.post("/kie/generate", requireApprovedUser, async (req, res) => {
  const backend = (process.env.IMAGE_BACKEND || "kie").toLowerCase();
  let { prompt, referenceImage, logoImage, productImages, aspect_ratio, resolution, model } = req.body || {};
  if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: "prompt is required" });
  if (!referenceImage) return res.status(400).json({ error: "reference image is required" });
  if (!logoImage) return res.status(400).json({ error: "brand logo is required" });
  aspect_ratio = aspect_ratio || "auto";

  // Enforce the per-user daily cap BEFORE spending money on an image. Admins skip.
  if (!req.profile.is_admin) {
    let used;
    try {
      used = await generationsToday(req.user.id);
    } catch (e) {
      return res.status(502).json({ error: "Couldn't check your daily usage: " + (e.message || e) });
    }
    if (used >= dailyLimit()) {
      return res.status(429).json({
        error: "Daily limit of " + dailyLimit() + " reached. It resets at midnight (AEST).",
      });
    }
  }

  // OpenRouter backend: synchronous — return the finished image data URLs directly.
  if (backend === "openrouter") {
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) return res.status(500).json({ error: "OPENROUTER_API_KEY is not set in .env" });
    const defaultModel = process.env.OPENROUTER_IMAGE_MODEL || "openai/gpt-5.4-image-2";
    // Honor a client-supplied model only if it's in the allowlist (admin picker); else default.
    const orModel = model && imageModelAllowlist().includes(model) ? model : defaultModel;
    try {
      const urls = await openrouterGenerateImage(orKey, orModel, { prompt, referenceImage, logoImage, productImages, aspect_ratio });
      await recordGeneration(req.user.id);
      return res.json({ urls, done: true });
    } catch (e) {
      return res.status(502).json({ error: e.message || String(e) });
    }
  }

  // KIE backend (default): upload images, create a task, client polls /kie/result.
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "KIE_API_KEY is not set in .env" });

  const kieModel = process.env.KIE_IMAGE_MODEL || "gpt-image-2-image-to-image";
  resolution = resolution || process.env.KIE_IMAGE_RESOLUTION || "1K";
  if (aspect_ratio === "1:1" && resolution === "4K") resolution = "2K"; // KIE forbids this combo

  try {
    // Reference ad first, brand logo second, then up to 3 product/UI assets.
    const input_urls = [
      await kieUploadBase64(apiKey, referenceImage, "reference.png"),
      await kieUploadBase64(apiKey, logoImage, "logo.png"),
    ];
    const products = Array.isArray(productImages) ? productImages.filter(Boolean).slice(0, 3) : [];
    for (let i = 0; i < products.length; i++) {
      input_urls.push(await kieUploadBase64(apiKey, products[i], "product" + (i + 1) + ".png"));
    }
    const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: kieModel,
        input: { prompt: String(prompt).slice(0, 20000), input_urls, aspect_ratio, resolution },
      }),
    });
    let data;
    try { data = await r.json(); } catch (e) { data = null; }
    const taskId = data && data.data && data.data.taskId;
    if (!r.ok || (data && data.code !== 200) || !taskId) {
      return res.status(502).json({ error: (data && (data.msg || data.message)) || "KIE createTask HTTP " + r.status });
    }
    await recordGeneration(req.user.id);
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
